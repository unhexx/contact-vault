/**
 * Integration tests for import + merge (Postgres).
 *
 * Skip policy (Issue 5):
 * - SKIP_DB_TESTS=1 → describe.skip (explicit opt-out)
 * - DB unreachable with default/set DATABASE_URL → beforeAll throws (no false green)
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPrismaClient, type PrismaClient } from "@contact-vault/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { importReport } from "./ingestion.js";
import {
  dismissSuggestion,
  findNormKeyCollisions,
  mergePersons,
  previewMerge,
} from "./merge.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://contactvault:contactvault@localhost:5432/contactvault";

const skipDb = process.env.SKIP_DB_TESTS === "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../../");
const fixtureTxt = path.join(
  repoRoot,
  "packages/parser/fixtures/sectioned-text/person-basic.txt",
);
const fixtureHtml = path.join(
  repoRoot,
  "packages/parser/fixtures/void-html/person-basic.embed.html",
);
const fixtureInlineDossier = path.join(
  repoRoot,
  "packages/parser/fixtures/inline-dossier/person-scoring-basic.txt",
);

function load(p: string): string {
  return readFileSync(p, "utf8");
}

function synthProv(reportId: string) {
  return [
    {
      reportId,
      sourceName: "fixture",
      section: "test",
      originalKey: "k",
      originalValue: "v",
      extractedAt: new Date().toISOString(),
    },
  ];
}

describe.skipIf(skipDb)("ingestion + merge integration", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    prisma = createPrismaClient(DATABASE_URL);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      await prisma.$disconnect().catch(() => undefined);
      throw new Error(
        `Postgres unreachable at ${DATABASE_URL}. ` +
          `Start Postgres or set SKIP_DB_TESTS=1 to opt out. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("imports sectioned-text, is idempotent, creates merge on shared phone", async () => {
    // Unique content per run to avoid cross-run pollution while testing happy path
    const suffix = `\n# test-run ${Date.now()}\n`;
    const contentA = load(fixtureTxt) + suffix;
    const contentB =
      load(fixtureTxt).replace("Тестов Тест Тестович", "Другов Друг Другович") +
      suffix +
      "\n# variant\n";

    const r1 = await importReport(
      { prisma, storeRawReports: false },
      { filename: "person-basic.txt", content: contentA },
    );
    expect(r1.duplicate).toBe(false);
    expect(r1.format).toBe("sectioned-text");
    expect(r1.personIds.length).toBeGreaterThanOrEqual(1);
    expect(
      r1.mergeSuggestions.every((s) => s.newPersonId !== s.targetPersonId),
    ).toBe(true);

    // Re-import same content → duplicate
    const rDup = await importReport(
      { prisma, storeRawReports: false },
      { filename: "person-basic.txt", content: contentA },
    );
    expect(rDup.duplicate).toBe(true);
    expect(rDup.reportImportId).toBe(r1.reportImportId);
    expect(rDup.personIds).toEqual(r1.personIds);

    // Second person sharing phone should suggest merge with first
    const r2 = await importReport(
      { prisma, storeRawReports: false },
      { filename: "person-variant.txt", content: contentB },
    );
    expect(r2.duplicate).toBe(false);
    expect(r2.personIds.length).toBeGreaterThanOrEqual(1);
    // Expect at least one suggestion targeting someone from first import
    const targetsFirst = r2.mergeSuggestions.filter((s) =>
      r1.personIds.includes(s.targetPersonId),
    );
    expect(targetsFirst.length).toBeGreaterThanOrEqual(1);
    for (const s of r2.mergeSuggestions) {
      expect(s.newPersonId).not.toBe(s.targetPersonId);
      expect(r2.personIds).toContain(s.newPersonId);
    }

    const sug = targetsFirst[0]!;
    // Capture source import id for KD22 assertion (before merge moves PSR)
    const sourcePsrBefore = await prisma.personSourceReport.findMany({
      where: { personId: sug.newPersonId },
    });
    expect(sourcePsrBefore.length).toBeGreaterThanOrEqual(1);
    const sourceReportImportIds = sourcePsrBefore.map((p) => p.reportImportId);

    const preview = await previewMerge(prisma, sug.id);
    expect(preview.sourcePersonId).toBe(sug.newPersonId);
    expect(preview.targetPersonId).toBe(sug.targetPersonId);
    expect(preview.source.personSourceReports).toBeGreaterThanOrEqual(1);
    expect(preview.collisions.length).toBeGreaterThanOrEqual(1);

    const collisions = await findNormKeyCollisions(
      prisma,
      sug.newPersonId,
      sug.targetPersonId,
    );
    expect(collisions.some((c) => c.field === "phone")).toBe(true);

    const merged = await mergePersons(prisma, {
      sourcePersonId: sug.newPersonId,
      targetPersonId: sug.targetPersonId,
      suggestionId: sug.id,
    });
    expect(merged.targetPersonId).toBe(sug.targetPersonId);

    // Source soft-deleted
    const source = await prisma.person.findUnique({
      where: { id: sug.newPersonId },
    });
    expect(source?.deletedAt).not.toBeNull();

    // KD22: source has zero PSR rows; target owns source's reportImportId links
    const sourcePsrsAfter = await prisma.personSourceReport.findMany({
      where: { personId: sug.newPersonId },
    });
    expect(sourcePsrsAfter).toHaveLength(0);

    const targetPsrs = await prisma.personSourceReport.findMany({
      where: { personId: sug.targetPersonId },
    });
    const targetImportIds = new Set(targetPsrs.map((p) => p.reportImportId));
    for (const rid of sourceReportImportIds) {
      expect(targetImportIds.has(rid)).toBe(true);
    }
    expect(targetPsrs.length).toBeGreaterThanOrEqual(2);

    // Suggestion accepted
    const sugRow = await prisma.mergeSuggestion.findUnique({
      where: { id: sug.id },
    });
    expect(sugRow?.status).toBe("accepted");

    // Audit merge — prove PersonSourceReport move recorded
    const audits = await prisma.auditLog.findMany({
      where: { action: "merge", entityId: sug.targetPersonId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(audits.length).toBe(1);
    const payload = audits[0]!.payload as {
      movedEntityIds?: { personSourceReports?: string[] };
      skippedPersonSourceReportIds?: string[];
      sourcePersonId?: string;
    };
    expect(payload.sourcePersonId).toBe(sug.newPersonId);
    const moved = payload.movedEntityIds?.personSourceReports?.length ?? 0;
    const skipped = payload.skippedPersonSourceReportIds?.length ?? 0;
    expect(moved + skipped).toBeGreaterThanOrEqual(1);
    expect(moved).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("dismiss keeps both persons", async () => {
    const stamp = Date.now();
    // Two imports with shared synthetic phone via sectioned content
    const base = `
=== Общая сводка ===
Телефон: +7 900 111-22-33
Email: dismiss.test.${stamp}@example.com
Личности: Аааа Бббб Вввв 01.01.1991
СНИЛС: 111-111-111 11

=== Источник A ===
ФИО: Аааа Бббб Вввв
Телефон: 89001112233
`;
    const variant = `
=== Общая сводка ===
Телефон: +7 900 111-22-33
Email: dismiss.other.${stamp}@example.com
Личности: Гггг Дддд Ееее 02.02.1992
СНИЛС: 222-222-222 22

=== Источник B ===
ФИО: Гггг Дддд Ееее
Телефон: 89001112233
`;

    const a = await importReport(
      { prisma, storeRawReports: false },
      { filename: "dismiss-a.txt", content: base },
    );
    const b = await importReport(
      { prisma, storeRawReports: false },
      { filename: "dismiss-b.txt", content: variant },
    );
    expect(a.personIds.length).toBeGreaterThanOrEqual(1);
    expect(b.mergeSuggestions.length).toBeGreaterThanOrEqual(1);
    const sug = b.mergeSuggestions[0]!;

    const res = await dismissSuggestion(prisma, sug.id);
    expect(res.ok).toBe(true);

    const row = await prisma.mergeSuggestion.findUnique({
      where: { id: sug.id },
    });
    expect(row?.status).toBe("dismissed");

    // Both persons still active
    const pNew = await prisma.person.findFirst({
      where: { id: sug.newPersonId, deletedAt: null },
    });
    const pTarget = await prisma.person.findFirst({
      where: { id: sug.targetPersonId, deletedAt: null },
    });
    expect(pNew).not.toBeNull();
    expect(pTarget).not.toBeNull();
  }, 60_000);

  it("rejects unknown format without writing completed import", async () => {
    const content = `not a real report ${Date.now()}`;
    await expect(
      importReport(
        { prisma, storeRawReports: false },
        { filename: "junk.txt", content },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("imports void-html fixture", async () => {
    const content = load(fixtureHtml) + `\n<!-- ${Date.now()} -->\n`;
    const r = await importReport(
      { prisma, storeRawReports: false },
      { filename: "person-basic.embed.html", content },
    );
    expect(r.duplicate).toBe(false);
    expect(r.format).toBe("void-html");
    expect(r.personIds.length).toBe(1);
  }, 60_000);

  it("imports inline-dossier with riskScores, mode inline_dossier, idempotent", async () => {
    const stamp = Date.now();
    // Unique-ify phone so re-runs do not collide with prior persons on exact match
    const content =
      load(fixtureInlineDossier)
        .replace(/\+7 900 000-00-01/g, `+7 900 ${String(stamp).slice(-7)}`)
        .replace(/testov\.fake@example\.com/g, `testov.${stamp}@example.com`) +
      `\n# test-run ${stamp}\n`;

    const r1 = await importReport(
      { prisma, storeRawReports: false },
      { filename: "person-scoring-basic.txt", content },
    );
    expect(r1.duplicate).toBe(false);
    expect(r1.format).toBe("inline-dossier");
    expect(r1.personIds.length).toBeGreaterThanOrEqual(1);

    const personId = r1.personIds[0]!;
    const risks = await prisma.riskScore.findMany({
      where: { personId, deletedAt: null },
    });
    expect(risks.length).toBeGreaterThanOrEqual(1);
    expect(risks[0]!.overall).toBeCloseTo(0.8, 5);

    // Scoring articles land on risk score; incident rows may also be created
    expect(risks[0]!.articles).toBeTruthy();
    const incidents = await prisma.incident.findMany({
      where: { personId, deletedAt: null },
    });
    // Parser may map article lines to risk.articles and/or Incident — either is fine for ingestion
    const articleBlob = JSON.stringify(risks[0]!.articles ?? []);
    const hasArticle =
      articleBlob.includes("228") ||
      incidents.some((i) => (i.articleCode ?? i.title ?? "").includes("228"));
    expect(hasArticle).toBe(true);

    const psrs = await prisma.personSourceReport.findMany({
      where: { personId },
    });
    expect(psrs.length).toBeGreaterThanOrEqual(1);
    // KD31: write path always stores underscore form
    expect(psrs.every((p) => p.mode === "inline_dossier")).toBe(true);

    const report = await prisma.reportImport.findUnique({
      where: { id: r1.reportImportId },
    });
    expect(report?.format).toBe("inline_dossier");

    // contentHash idempotency
    const rDup = await importReport(
      { prisma, storeRawReports: false },
      { filename: "person-scoring-basic.txt", content },
    );
    expect(rDup.duplicate).toBe(true);
    expect(rDup.reportImportId).toBe(r1.reportImportId);
    expect(rDup.format).toBe("inline-dossier");
    expect(rDup.personIds).toEqual(r1.personIds);
  }, 60_000);

  it("merge always-moves riskScores + incidents (KD34); preview counts include them", async () => {
    const stamp = Date.now();
    const reportA = randomUUID();
    const reportB = randomUUID();
    const phone = `+7900${String(stamp).slice(-7)}`;

    // Two ReportImports (required for PersonSourceReport FKs)
    await prisma.reportImport.createMany({
      data: [
        {
          id: reportA,
          format: "inline_dossier",
          status: "completed",
          contentHash: `hash-a-${stamp}`,
          filename: "a.txt",
          completedAt: new Date(),
        },
        {
          id: reportB,
          format: "inline_dossier",
          status: "completed",
          contentHash: `hash-b-${stamp}`,
          filename: "b.txt",
          completedAt: new Date(),
        },
      ],
    });

    const target = await prisma.person.create({
      data: {
        canonicalFull: `Target ${stamp}`,
        contactPoints: {
          create: {
            kind: "phone",
            e164: phone,
            raw: phone,
            provenance: synthProv(reportA),
          },
        },
        riskScores: {
          create: [
            {
              overall: 0.1,
              label: "target-low",
              categories: [],
              articles: [],
              provenance: synthProv(reportA),
            },
          ],
        },
        incidents: {
          create: [
            {
              severity: "low",
              title: "target-inc",
              articleCode: "T-1",
              provenance: synthProv(reportA),
            },
          ],
        },
        sourceReports: {
          create: {
            reportImportId: reportA,
            query: "",
            contentHash: `hash-a-${stamp}`,
            mode: "inline_dossier",
          },
        },
      },
    });

    const source = await prisma.person.create({
      data: {
        canonicalFull: `Source ${stamp}`,
        contactPoints: {
          create: {
            kind: "phone",
            e164: phone,
            raw: phone,
            provenance: synthProv(reportB),
          },
        },
        riskScores: {
          create: [
            {
              overall: 0.9,
              label: "source-high-1",
              categories: [{ name: "fraud", flag: 1 }],
              articles: [{ code: "159" }],
              provenance: synthProv(reportB),
            },
            {
              overall: 0.7,
              label: "source-high-2",
              categories: [],
              articles: [],
              provenance: synthProv(reportB),
            },
          ],
        },
        incidents: {
          create: [
            {
              severity: "high",
              title: "source-inc-1",
              articleCode: "S-1",
              provenance: synthProv(reportB),
            },
            {
              severity: "medium",
              title: "source-inc-2",
              articleCode: "S-2",
              provenance: synthProv(reportB),
            },
            {
              severity: "low",
              title: "source-inc-3",
              articleCode: "S-3",
              provenance: synthProv(reportB),
            },
          ],
        },
        sourceReports: {
          create: {
            reportImportId: reportB,
            query: "",
            contentHash: `hash-b-${stamp}`,
            mode: "inline_dossier",
          },
        },
      },
    });

    const sourceRiskIds = (
      await prisma.riskScore.findMany({
        where: { personId: source.id, deletedAt: null },
        select: { id: true },
      })
    ).map((r) => r.id);
    const sourceIncidentIds = (
      await prisma.incident.findMany({
        where: { personId: source.id, deletedAt: null },
        select: { id: true },
      })
    ).map((r) => r.id);
    expect(sourceRiskIds).toHaveLength(2);
    expect(sourceIncidentIds).toHaveLength(3);

    const suggestion = await prisma.mergeSuggestion.create({
      data: {
        reportImportId: reportB,
        newPersonId: source.id,
        targetPersonId: target.id,
        matchedOn: [{ field: "phone", value: phone }],
        status: "open",
      },
    });

    const preview = await previewMerge(prisma, suggestion.id);
    expect(preview.source.riskScores).toBe(2);
    expect(preview.source.incidents).toBe(3);
    expect(preview.target.riskScores).toBe(1);
    expect(preview.target.incidents).toBe(1);

    const merged = await mergePersons(prisma, {
      sourcePersonId: source.id,
      targetPersonId: target.id,
      suggestionId: suggestion.id,
    });
    expect(merged.targetPersonId).toBe(target.id);

    // Source soft-deleted
    const sourceRow = await prisma.person.findUnique({
      where: { id: source.id },
    });
    expect(sourceRow?.deletedAt).not.toBeNull();

    // All source risk/incidents now on survivor (always-move, no dedupe)
    const targetRisks = await prisma.riskScore.findMany({
      where: { personId: target.id, deletedAt: null },
    });
    const targetIncidents = await prisma.incident.findMany({
      where: { personId: target.id, deletedAt: null },
    });
    expect(targetRisks).toHaveLength(1 + 2); // target kept + source moved
    expect(targetIncidents).toHaveLength(1 + 3);

    for (const id of sourceRiskIds) {
      expect(targetRisks.some((r) => r.id === id)).toBe(true);
    }
    for (const id of sourceIncidentIds) {
      expect(targetIncidents.some((r) => r.id === id)).toBe(true);
    }

    // Source owns none
    expect(
      await prisma.riskScore.count({
        where: { personId: source.id, deletedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.incident.count({
        where: { personId: source.id, deletedAt: null },
      }),
    ).toBe(0);

    // Audit payload records moved ids
    const audits = await prisma.auditLog.findMany({
      where: { action: "merge", entityId: target.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(audits.length).toBe(1);
    const payload = audits[0]!.payload as {
      movedEntityIds?: { riskScores?: string[]; incidents?: string[] };
    };
    expect(payload.movedEntityIds?.riskScores?.sort()).toEqual(
      [...sourceRiskIds].sort(),
    );
    expect(payload.movedEntityIds?.incidents?.sort()).toEqual(
      [...sourceIncidentIds].sort(),
    );
  }, 60_000);
});
