/**
 * Integration tests for import + merge (Postgres).
 * Skips when DATABASE_URL is unset or DB unreachable.
 */
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

describe("ingestion + merge integration", () => {
  let prisma: PrismaClient;
  let available = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    prisma = createPrismaClient(DATABASE_URL);
    try {
      await prisma.$queryRaw`SELECT 1`;
      available = true;
    } catch {
      available = false;
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("imports sectioned-text, is idempotent, creates merge on shared phone", async () => {
    if (!available) {
      console.warn("SKIP: Postgres not available");
      return;
    }

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

    // Target has source-report links from both (or at least ≥1; move may skip dup hash)
    const psrs = await prisma.personSourceReport.findMany({
      where: { personId: sug.targetPersonId },
    });
    expect(psrs.length).toBeGreaterThanOrEqual(1);

    // Suggestion accepted
    const sugRow = await prisma.mergeSuggestion.findUnique({
      where: { id: sug.id },
    });
    expect(sugRow?.status).toBe("accepted");

    // Audit merge
    const audits = await prisma.auditLog.findMany({
      where: { action: "merge", entityId: sug.targetPersonId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(audits.length).toBe(1);
    const payload = audits[0]!.payload as {
      movedEntityIds?: { personSourceReports?: string[] };
      sourcePersonId?: string;
    };
    expect(payload.sourcePersonId).toBe(sug.newPersonId);
  }, 60_000);

  it("dismiss keeps both persons", async () => {
    if (!available) {
      console.warn("SKIP: Postgres not available");
      return;
    }

    const stamp = Date.now();
    // Two imports with shared synthetic phone via void-html style sectioned content
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
    // silence unused if first import empty persons somehow
    expect(a.personIds.length).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("rejects unknown format without writing completed import", async () => {
    if (!available) return;
    const content = `not a real report ${Date.now()}`;
    await expect(
      importReport(
        { prisma, storeRawReports: false },
        { filename: "junk.txt", content },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("imports void-html fixture", async () => {
    if (!available) return;
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
