/**
 * Integration tests for import + merge (Postgres).
 *
 * Skip policy (Issue 5):
 * - SKIP_DB_TESTS=1 → describe.skip (explicit opt-out)
 * - DB unreachable with default/set DATABASE_URL → beforeAll throws (no false green)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPersonRepository,
  createPrismaClient,
  type PrismaClient,
} from "@contact-vault/db";
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

function load(p: string): string {
  return readFileSync(p, "utf8");
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

  it("merge fills blank target Person scalars from source and keeps them on 360", async () => {
    const stamp = Date.now();
    const phone = `+7900${String(stamp).slice(-7)}`;
    const sourceName = `Синтетик Источник ${stamp}`;
    const emptyProv = [] as const;

    const target = await prisma.person.create({
      data: {
        contactPoints: {
          create: {
            kind: "phone",
            e164: phone,
            raw: phone,
            provenance: emptyProv,
          },
        },
      },
    });

    const source = await prisma.person.create({
      data: {
        canonicalFull: sourceName,
        canonicalLast: "Синтетик",
        canonicalFirst: "Источник",
        canonicalMiddle: "Тестович",
        dateOfBirth: "1990-01-15",
        placeOfBirth: "г. Тестовск",
        gender: "male",
        extras: { note: "source-only" },
        contactPoints: {
          create: {
            kind: "phone",
            e164: phone,
            raw: phone,
            provenance: emptyProv,
          },
        },
        nameVariants: {
          create: {
            full: sourceName,
            last: "Синтетик",
            first: "Источник",
            middle: "Тестович",
            provenance: emptyProv,
          },
        },
      },
    });

    await mergePersons(prisma, {
      sourcePersonId: source.id,
      targetPersonId: target.id,
    });

    const persons = createPersonRepository(prisma);
    const survivor = await persons.get360(target.id);
    expect(survivor).not.toBeNull();
    expect(survivor!.canonicalName?.full).toBe(sourceName);
    expect(survivor!.dateOfBirth).toBe("1990-01-15");
    expect(survivor!.placeOfBirth).toBe("г. Тестовск");
    expect(survivor!.gender).toBe("male");
    expect(survivor!.extras).toEqual({ note: "source-only" });

    const targetRow = await prisma.person.findUnique({ where: { id: target.id } });
    expect(targetRow?.canonicalFull).toBe(sourceName);
    expect(targetRow?.canonicalLast).toBe("Синтетик");
    expect(targetRow?.canonicalFirst).toBe("Источник");
    expect(targetRow?.canonicalMiddle).toBe("Тестович");
    expect(targetRow?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      target.updatedAt.getTime(),
    );
    expect(targetRow?.deletedAt).toBeNull();

    const sourceRow = await prisma.person.findUnique({ where: { id: source.id } });
    expect(sourceRow?.deletedAt).not.toBeNull();

    const listed = await persons.list({ q: sourceName, limit: 20 });
    expect(listed.items.some((item) => item.id === target.id)).toBe(true);
  }, 60_000);

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
});
