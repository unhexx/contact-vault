/**
 * Report ingestion service (KD6, KD13, KD14, KD16, KD19, KD21).
 *
 * Match-before-create → always create Person → MergeSuggestion only.
 * No silent merge. No raw blob by default.
 */
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  contentHashOf,
  extractExactMatchKeys,
} from "@contact-vault/domain";
import {
  createAuditLogRepository,
  createMergeSuggestionRepository,
  createPersonRepository,
  createReportImportRepository,
  Prisma,
  type MatchedOnField,
  type PrismaClient,
} from "@contact-vault/db";
import { parseReport, type ParseWarning } from "@contact-vault/parser";

import { AppError } from "../errors.js";
import {
  dbFormatToApi,
  modeFromFormat,
  parserFormatToDb,
  type ApiReportFormat,
} from "./format-map.js";

/** Max UTF-16 code units of content string (~15M chars). */
export const MAX_IMPORT_CHARS = 15_000_000;

/** Thrown when detectFormat returns unknown (lists all accepted formats). */
export const UNKNOWN_FORMAT_MESSAGE =
  "Could not detect report format (void-html, sectioned-text, or inline-dossier required)";

const ALLOWED_FILENAME = /\.(html?|txt)$/i;

export type ImportResult = {
  reportImportId: string;
  format: ApiReportFormat;
  contentHash: string;
  duplicate: boolean;
  warnings: ParseWarning[];
  personIds: string[];
  mergeSuggestions: Array<{
    id: string;
    newPersonId: string;
    targetPersonId: string;
    matchedOn: MatchedOnField[];
  }>;
};

export type IngestionDeps = {
  prisma: PrismaClient;
  storeRawReports?: boolean;
  /** Project root for raw blob path (default process.cwd()). */
  dataRoot?: string;
};

/**
 * True only when P2002 is on ReportImport.contentHash (import race).
 * Other unique targets (IdentityDocument, MergeSuggestion, PSR) must not
 * be masked as contentHash race (Issue 1).
 *
 * Exported for unit tests.
 */
export function isContentHashUniqueViolation(err: unknown): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== "P2002"
  ) {
    return false;
  }
  const target = err.meta?.target;
  if (typeof target === "string") {
    // Prisma may report "contentHash" or a constraint name containing it
    return (
      target === "contentHash" ||
      target.includes("contentHash") ||
      target.includes("content_hash")
    );
  }
  if (Array.isArray(target)) {
    return target.some(
      (t) =>
        t === "contentHash" ||
        (typeof t === "string" &&
          (t.includes("contentHash") || t.includes("content_hash"))),
    );
  }
  return false;
}

function asMatchedOn(value: unknown): MatchedOnField[] {
  if (!Array.isArray(value)) return [];
  return value as MatchedOnField[];
}

function asWarnings(value: unknown): ParseWarning[] {
  if (!Array.isArray(value)) return [];
  return value as ParseWarning[];
}

export function validateImportInput(input: {
  filename: string;
  content: string;
}): void {
  const name = input.filename?.trim() ?? "";
  if (!name || !ALLOWED_FILENAME.test(name)) {
    throw new AppError(
      "BAD_REQUEST",
      "Filename must end with .html, .htm, or .txt",
      "INVALID_FILENAME",
    );
  }
  if (input.content.length > MAX_IMPORT_CHARS) {
    throw new AppError(
      "BAD_REQUEST",
      `Import content exceeds MAX_IMPORT_CHARS (${MAX_IMPORT_CHARS})`,
      "IMPORT_TOO_LARGE",
    );
  }
}

async function buildDuplicateResult(
  prisma: PrismaClient,
  reportImportId: string,
  contentHash: string,
  format: string,
  warnings: unknown,
): Promise<ImportResult> {
  const personLinks = await prisma.personSourceReport.findMany({
    where: { reportImportId },
    select: { personId: true },
  });
  const personIds = [...new Set(personLinks.map((l) => l.personId))];

  // Re-import banner should only surface still-open suggestions (Issue 7)
  const suggestions = await prisma.mergeSuggestion.findMany({
    where: { reportImportId, status: "open" },
    orderBy: { createdAt: "asc" },
  });

  const apiFormat = dbFormatToApi(format);
  // Completed imports of supported formats only (no silent sectioned fallback)
  if (apiFormat === "unknown") {
    throw new AppError(
      "INTERNAL",
      `Unexpected format on completed import: ${format}`,
      "UNEXPECTED_FORMAT",
    );
  }

  return {
    reportImportId,
    format: apiFormat,
    contentHash,
    duplicate: true,
    warnings: asWarnings(warnings),
    personIds,
    mergeSuggestions: suggestions
      .filter((s) => s.newPersonId !== s.targetPersonId)
      .map((s) => ({
        id: s.id,
        newPersonId: s.newPersonId,
        targetPersonId: s.targetPersonId,
        matchedOn: asMatchedOn(s.matchedOn),
      })),
  };
}

/**
 * Import a report file: hash → idempotent re-fetch or parse + transactional persist.
 */
export async function importReport(
  deps: IngestionDeps,
  input: { filename: string; content: string },
): Promise<ImportResult> {
  validateImportInput(input);

  const { prisma } = deps;
  const storeRaw = deps.storeRawReports ?? false;
  const dataRoot = deps.dataRoot ?? process.cwd();

  const contentHash = contentHashOf(input.content);
  const reportImportRepo = createReportImportRepository(prisma);

  // Idempotency: completed import with same contentHash
  const existing = await reportImportRepo.findByContentHash(contentHash);
  if (existing?.status === "completed") {
    return buildDuplicateResult(
      prisma,
      existing.id,
      contentHash,
      existing.format,
      existing.warnings,
    );
  }
  if (existing && existing.status !== "failed") {
    // pending / parsed — another import in flight
    throw new AppError(
      "CONFLICT",
      "Import with this content hash is already in progress",
      "IMPORT_IN_PROGRESS",
    );
  }

  // KD16: UUID before parse; equals ReportImport.id
  const reportImportId = randomUUID();
  const parsed = parseReport({
    content: input.content,
    filename: input.filename,
    reportId: reportImportId,
  });

  if (parsed.format === "unknown") {
    throw new AppError("BAD_REQUEST", UNKNOWN_FORMAT_MESSAGE, "UNKNOWN_FORMAT");
  }

  const hardErrors = parsed.warnings.filter((w) => w.severity === "error");
  if (parsed.persons.length === 0) {
    throw new AppError(
      "BAD_REQUEST",
      hardErrors[0]?.message ??
        "Parse produced no persons (empty or unparseable report)",
      hardErrors[0]?.code ?? "NO_PERSONS",
    );
  }

  // narrowed past "unknown" above
  const apiFormat: ApiReportFormat = parsed.format;
  const dbFormat = parserFormatToDb(apiFormat);
  const mode = modeFromFormat(apiFormat);
  const byteSize = Buffer.byteLength(input.content, "utf8");
  const query = parsed.reportMeta.reportQuery ?? "";

  // KD14: planned relative path only inside TX; write file AFTER successful commit
  // so failed/raced imports do not leave orphan blobs (Issue 4).
  const rawRel = storeRaw
    ? path.join("data", "reports", `${reportImportId}.bin`)
    : null;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const personRepo = createPersonRepository(tx);
        const mergeRepo = createMergeSuggestionRepository(tx);
        const auditRepo = createAuditLogRepository(tx);
        const importRepo = createReportImportRepository(tx);

        // Insert ReportImport with explicit id (status parsed → completed)
        await importRepo.create({
          id: reportImportId,
          format: dbFormat,
          contentHash,
          filename: input.filename,
          reportQuery: query || null,
          byteSize,
          warnings: parsed.warnings,
          status: "parsed",
          rawStorage: rawRel,
        });

        const personIds: string[] = [];
        const mergeSuggestions: ImportResult["mergeSuggestions"] = [];

        for (const draft of parsed.persons) {
          // KD21: match BEFORE create (existing DB only)
          const keys = extractExactMatchKeys(draft);
          const candidates = await personRepo.findByExactKeys(keys, {}, tx);

          const newPerson = await personRepo.createFromDraft(
            draft,
            {
              reportImportId,
              contentHash,
              query,
              mode,
            },
            tx,
          );
          personIds.push(newPerson.id);

          const suggestionInputs = candidates
            .filter((c) => c.personId !== newPerson.id)
            .map((c) => ({
              reportImportId,
              newPersonId: newPerson.id,
              targetPersonId: c.personId,
              matchedOn: c.matchedOn,
            }));

          if (suggestionInputs.length > 0) {
            const created = await mergeRepo.createMany(suggestionInputs, tx);
            for (const s of created) {
              mergeSuggestions.push({
                id: s.id,
                newPersonId: s.newPersonId,
                targetPersonId: s.targetPersonId,
                matchedOn: asMatchedOn(s.matchedOn),
              });
            }
          }
        }

        await auditRepo.append(
          {
            action: "import",
            entityType: "ReportImport",
            entityId: reportImportId,
            payload: {
              contentHash,
              format: apiFormat,
              personIds,
              suggestionCount: mergeSuggestions.length,
              filename: input.filename,
            },
          },
          tx,
        );

        await importRepo.updateStatus(
          reportImportId,
          {
            status: "completed",
            completedAt: new Date(),
            warnings: parsed.warnings,
          },
          tx,
        );

        return {
          reportImportId,
          format: apiFormat,
          contentHash,
          duplicate: false,
          warnings: parsed.warnings,
          personIds,
          mergeSuggestions,
        } satisfies ImportResult;
      },
      {
        // Interactive transaction for match + create + suggestions (KD19)
        maxWait: 10_000,
        timeout: 60_000,
      },
    );

    // Persist raw body only after successful commit (best-effort; clear path on failure)
    if (storeRaw && rawRel) {
      try {
        const abs = path.join(dataRoot, rawRel);
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, input.content, "utf8");
      } catch (writeErr) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "STORE_RAW_REPORTS write failed after successful import",
            reportImportId,
            path: rawRel,
            error:
              writeErr instanceof Error ? writeErr.message : String(writeErr),
          }),
        );
        // Clear stale rawStorage pointer so UI does not claim a missing file
        try {
          await prisma.reportImport.update({
            where: { id: reportImportId },
            data: { rawStorage: null },
          });
        } catch {
          // ignore secondary failure
        }
      }
    }

    return result;
  } catch (err) {
    // Best-effort: never leave orphan files (defensive if write ever moves earlier)
    if (storeRaw && rawRel) {
      try {
        await unlink(path.join(dataRoot, rawRel));
      } catch {
        // file may not exist — fine
      }
    }

    // Issue 1: only contentHash unique is an import race
    if (isContentHashUniqueViolation(err)) {
      const raced = await reportImportRepo.findByContentHash(contentHash);
      if (raced?.status === "completed") {
        return buildDuplicateResult(
          prisma,
          raced.id,
          contentHash,
          raced.format,
          raced.warnings,
        );
      }
      throw new AppError(
        "CONFLICT",
        "Import with this content hash is already in progress",
        "IMPORT_IN_PROGRESS",
      );
    }

    // Other P2002 (docs / suggestions / PSR) — surface as UNIQUE_VIOLATION
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError(
        "CONFLICT",
        "Unique constraint violation during import",
        "UNIQUE_VIOLATION",
      );
    }

    throw err;
  }
}
