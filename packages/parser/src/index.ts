/**
 * @contact-vault/parser
 *
 * Pure detectFormat + parseReport for void-html and sectioned-text (KD4, KD8).
 * Depends only on @contact-vault/domain — no DB, no live /api/report poll.
 */

import { contentHashOf } from "@contact-vault/domain";
import { detectFormat } from "./detectFormat.js";
import { parseSectionedText } from "./sectionedText/parse.js";
import type { ParseReportInput, ParseResult, ReportFormat } from "./types.js";
import { parseVoidHtml } from "./voidHtml/parse.js";

export type {
  ParseReportInput,
  ParseResult,
  ParseWarning,
  ReportFormat,
  ReportMeta,
} from "./types.js";

export { detectFormat } from "./detectFormat.js";

export {
  normalizePhone,
  parseFio,
  normalizeDate,
  mapDocumentType,
} from "./normalize/index.js";

/**
 * Parse a report into domain DTOs.
 *
 * @param reportId Required for production ingestion (ReportImport UUID).
 *                 For unit tests, may pass a fixed test UUID.
 *                 All Provenance.reportId values MUST equal this UUID (KD16).
 */
export function parseReport(input: ParseReportInput): ParseResult {
  const { content, filename, reportId } = input;
  const detectedAt = new Date().toISOString();
  const format: ReportFormat = detectFormat(content, filename);
  const contentHash = contentHashOf(content);

  if (format === "unknown") {
    return {
      format: "unknown",
      reportMeta: {
        contentHash,
        filename,
        detectedAt,
      },
      persons: [],
      relationships: [],
      warnings: [
        {
          code: "UNKNOWN_FORMAT",
          message:
            "Could not detect void-html or sectioned-text format (inline-dossier deferred)",
          severity: "error",
        },
      ],
    };
  }

  if (format === "void-html") {
    const result = parseVoidHtml(content, { reportId, extractedAt: detectedAt });
    return {
      format,
      reportMeta: {
        contentHash,
        reportQuery: result.reportQuery,
        filename,
        detectedAt,
      },
      persons: result.persons,
      relationships: result.relationships,
      warnings: result.warnings,
    };
  }

  // sectioned-text
  const result = parseSectionedText(content, {
    reportId,
    extractedAt: detectedAt,
  });
  return {
    format,
    reportMeta: {
      contentHash,
      reportQuery: result.reportQuery,
      filename,
      detectedAt,
    },
    persons: result.persons,
    relationships: result.relationships,
    warnings: result.warnings,
  };
}
