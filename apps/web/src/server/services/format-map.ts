/**
 * Shared API ↔ DB report-format mappers (KD40).
 * Single source of truth for ingestion + reports router — no silent sectioned fallback.
 */
import type { ReportFormatDb } from "@contact-vault/db";

export type ApiReportFormat =
  | "void-html"
  | "sectioned-text"
  | "inline-dossier";

/** Exhaustive parser/API → Prisma enum. */
export function parserFormatToDb(format: ApiReportFormat): ReportFormatDb {
  switch (format) {
    case "void-html":
      return "void_html";
    case "sectioned-text":
      return "sectioned_text";
    case "inline-dossier":
      return "inline_dossier";
    default: {
      const _x: never = format;
      throw new Error(`Unsupported parser format: ${_x as string}`);
    }
  }
}

/**
 * Prisma / stored string → API hyphen form.
 * Accepts underscore or hyphen. No silent fallback to sectioned-text.
 * Unknown values return "unknown" (caller must handle failed / legacy rows).
 */
export function dbFormatToApi(format: string): ApiReportFormat | "unknown" {
  switch (format) {
    case "void_html":
    case "void-html":
      return "void-html";
    case "sectioned_text":
    case "sectioned-text":
      return "sectioned-text";
    case "inline_dossier":
    case "inline-dossier":
      return "inline-dossier";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * Always emit domain underscore mode for PersonSourceReport.mode.
 * Never store hyphen form (KD31).
 */
export function modeFromFormat(format: ApiReportFormat): string {
  switch (format) {
    case "void-html":
      return "void_html";
    case "sectioned-text":
      return "sectioned_text"; // normalizeSourceMode aliases → text_export on write
    case "inline-dossier":
      return "inline_dossier"; // never store hyphen form
    default: {
      const _x: never = format;
      throw new Error(`Unsupported parser format for mode: ${_x as string}`);
    }
  }
}
