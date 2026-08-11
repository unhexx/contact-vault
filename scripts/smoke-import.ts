/**
 * Local smoke import (v0.1.1 release gate).
 *
 * Exercises three-format import (sectioned-text, void-html, inline-dossier),
 * re-import idempotency, merge accept path, and soft-delete against Docker
 * Postgres. No Playwright.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm db:generate && pnpm db:migrate:deploy  (or db:migrate)
 *   DATABASE_URL=postgresql://contactvault:contactvault@localhost:5432/contactvault
 *
 * Usage: pnpm smoke
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPersonRepository,
  createPrismaClient,
  type PrismaClient,
} from "@contact-vault/db";

import { importReport } from "../apps/web/src/server/services/ingestion.js";
import { mergePersons } from "../apps/web/src/server/services/merge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://contactvault:contactvault@localhost:5432/contactvault";

const samples = {
  sectioned: path.join(
    repoRoot,
    "samples/sectioned-text/person-basic.txt",
  ),
  voidHtml: path.join(
    repoRoot,
    "samples/void-html/person-basic.embed.html",
  ),
  inlineDossier: path.join(
    repoRoot,
    "samples/inline-dossier/person-scoring-basic.txt",
  ),
  variant: path.join(
    repoRoot,
    "samples/sectioned-text/person-variant-shared-phone.txt",
  ),
};

function load(p: string): string {
  return readFileSync(p, "utf8");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

function log(step: string, detail?: string): void {
  console.log(detail ? `✓ ${step}: ${detail}` : `✓ ${step}`);
}

async function main(): Promise<void> {
  process.env.DATABASE_URL = DATABASE_URL;
  const runId = `smoke-${Date.now()}`;
  // Unique suffix so re-runs do not collide with prior contentHash rows
  const tag = `\n# ${runId}\n`;

  console.log(`Contact Vault smoke — runId=${runId}`);
  console.log(`DATABASE_URL=${DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`);

  const prisma: PrismaClient = createPrismaClient(DATABASE_URL);
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    console.error(
      `Postgres unreachable at ${DATABASE_URL}.\n` +
        `Start with: docker compose up -d && pnpm db:migrate:deploy\n` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
    process.exit(1);
  }

  const personRepo = createPersonRepository(prisma);
  let failed = false;

  try {
    // --- 1. sectioned-text import ---
    const txtBase = load(samples.sectioned);
    const txtContent = txtBase + tag;
    const r1 = await importReport(
      { prisma, storeRawReports: false, dataRoot: repoRoot },
      { filename: "person-basic.txt", content: txtContent },
    );
    assert(r1.duplicate === false, "first sectioned-text import must not be duplicate");
    assert(r1.format === "sectioned-text", `expected sectioned-text, got ${r1.format}`);
    assert(r1.personIds.length >= 1, "sectioned-text must create ≥1 person");
    assert(
      r1.mergeSuggestions.every((s) => s.newPersonId !== s.targetPersonId),
      "no self-suggestions on first import",
    );
    const personA = r1.personIds[0]!;
    const viewA = await personRepo.get360(personA);
    assert(viewA, "get360 after sectioned-text import");
    log(
      "1 import sectioned-text",
      `person=${personA.slice(0, 8)}… format=${r1.format} warnings=${r1.warnings.length}`,
    );

    // --- 2. void-html import ---
    const htmlContent = load(samples.voidHtml) + `<!-- ${runId} -->\n`;
    const r2 = await importReport(
      { prisma, storeRawReports: false, dataRoot: repoRoot },
      { filename: "person-basic.embed.html", content: htmlContent },
    );
    assert(r2.duplicate === false, "void-html import must not be duplicate");
    assert(r2.format === "void-html", `expected void-html, got ${r2.format}`);
    assert(r2.personIds.length >= 1, "void-html must create ≥1 person");
    log(
      "2 import void-html",
      `person=${r2.personIds[0]!.slice(0, 8)}… format=${r2.format}`,
    );

    // --- 3. inline-dossier import (scoring → riskScores on get360) ---
    // Unique-ify phone/email so exact-match merge does not collide with prior steps
    const inlineBase = load(samples.inlineDossier)
      .replace(/\+7 900 000-00-01/g, `+7 900 ${String(Date.now()).slice(-7)}`)
      .replace(
        /testov\.fake@example\.com/g,
        `testov.smoke.${runId}@example.com`,
      );
    const inlineContent = inlineBase + tag;
    const rInline = await importReport(
      { prisma, storeRawReports: false, dataRoot: repoRoot },
      { filename: "person-scoring-basic.txt", content: inlineContent },
    );
    assert(
      rInline.duplicate === false,
      "inline-dossier import must not be duplicate",
    );
    assert(
      rInline.format === "inline-dossier",
      `expected inline-dossier, got ${rInline.format}`,
    );
    assert(
      rInline.personIds.length >= 1,
      "inline-dossier must create ≥1 person",
    );
    const personInline = rInline.personIds[0]!;
    const viewInline = await personRepo.get360(personInline);
    assert(viewInline, "get360 after inline-dossier import");
    assert(
      (viewInline.riskScores?.length ?? 0) >= 1,
      "get360 must include riskScores when fixture has scoring",
    );
    const overall = viewInline.riskScores[0]!.overall;
    assert(
      typeof overall === "number" && Math.abs(overall - 0.8) < 1e-6,
      `expected risk overall ≈ 0.8, got ${overall}`,
    );
    const riskLabel = viewInline.riskScores[0]!.label ?? "";
    assert(
      /плохо/i.test(riskLabel),
      `expected risk label to contain «плохо», got ${JSON.stringify(riskLabel)}`,
    );
    log(
      "3 import inline-dossier",
      `person=${personInline.slice(0, 8)}… format=${rInline.format} riskOverall=${overall}`,
    );

    // --- 4. re-import same sectioned content → duplicate ---
    const rDup = await importReport(
      { prisma, storeRawReports: false, dataRoot: repoRoot },
      { filename: "person-basic.txt", content: txtContent },
    );
    assert(rDup.duplicate === true, "re-import must return duplicate: true");
    assert(
      rDup.reportImportId === r1.reportImportId,
      "duplicate must reuse same reportImportId",
    );
    assert(
      JSON.stringify(rDup.personIds) === JSON.stringify(r1.personIds),
      "duplicate personIds must match original",
    );
    log("4 re-import idempotent", `reportImportId=${rDup.reportImportId.slice(0, 8)}…`);

    // --- 5. variant sharing phone → merge suggestion ---
    const variantContent = load(samples.variant) + tag + `\n# variant\n`;
    const r3 = await importReport(
      { prisma, storeRawReports: false, dataRoot: repoRoot },
      { filename: "person-variant-shared-phone.txt", content: variantContent },
    );
    assert(r3.duplicate === false, "variant import must not be duplicate");
    assert(r3.personIds.length >= 1, "variant must create ≥1 person");
    const targetsFirst = r3.mergeSuggestions.filter((s) =>
      r1.personIds.includes(s.targetPersonId),
    );
    assert(
      targetsFirst.length >= 1,
      `expected merge suggestion targeting first import person; got ${r3.mergeSuggestions.length} suggestion(s)`,
    );
    for (const s of r3.mergeSuggestions) {
      assert(s.newPersonId !== s.targetPersonId, "no self-suggestion");
      assert(r3.personIds.includes(s.newPersonId), "newPersonId must be from this import");
    }
    const sug = targetsFirst[0]!;
    log(
      "5 merge suggestion",
      `id=${sug.id.slice(0, 8)}… matchedOn=${sug.matchedOn.map((m) => m.field).join(",")}`,
    );

    // --- 6. accept merge → survivor Sources include both imports ---
    const sourcePsrsBefore = await prisma.personSourceReport.findMany({
      where: { personId: sug.newPersonId },
    });
    assert(sourcePsrsBefore.length >= 1, "source person must have PSR before merge");
    const sourceReportIds = sourcePsrsBefore.map((p) => p.reportImportId);

    const merged = await mergePersons(prisma, {
      sourcePersonId: sug.newPersonId,
      targetPersonId: sug.targetPersonId,
      suggestionId: sug.id,
    });
    assert(
      merged.targetPersonId === sug.targetPersonId,
      "merge survivor must be target",
    );

    const sourceAfter = await prisma.person.findUnique({
      where: { id: sug.newPersonId },
    });
    assert(sourceAfter?.deletedAt != null, "source person must be soft-deleted");

    const targetPsrs = await prisma.personSourceReport.findMany({
      where: { personId: sug.targetPersonId },
    });
    const targetImportIds = new Set(targetPsrs.map((p) => p.reportImportId));
    for (const rid of sourceReportIds) {
      assert(
        targetImportIds.has(rid),
        `survivor Sources missing moved reportImportId ${rid}`,
      );
    }
    assert(
      targetPsrs.length >= 2,
      `survivor must list ≥2 source reports (got ${targetPsrs.length})`,
    );

    const survivor360 = await personRepo.get360(sug.targetPersonId);
    assert(survivor360, "survivor get360 after merge");
    assert(
      (survivor360.sourceReports?.length ?? 0) >= 2,
      "domain person sourceReports ≥ 2 after merge",
    );
    log(
      "6 merge accept + Sources",
      `survivor=${sug.targetPersonId.slice(0, 8)}… psr=${targetPsrs.length}`,
    );

    // --- 7. soft-delete hides from get360 ---
    const toDelete = r2.personIds[0]!;
    await personRepo.softDelete(toDelete);
    const gone = await personRepo.get360(toDelete);
    assert(gone === null, "get360 must return null after soft-delete");
    log("7 soft-delete", `person=${toDelete.slice(0, 8)}… hidden`);

    console.log(
      "\nSMOKE PASS — three-format import, re-import, merge Sources, soft-delete OK",
    );
  } catch (err) {
    failed = true;
    console.error(
      "\n" + (err instanceof Error ? err.message : String(err)),
    );
    if (err instanceof Error && err.stack) {
      console.error(err.stack.split("\n").slice(1, 6).join("\n"));
    }
  } finally {
    await prisma.$disconnect();
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
