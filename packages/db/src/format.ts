/**
 * Single place for report-format names across parser, Prisma, and domain.
 *
 * parser:   void-html | sectioned-text | inline-dossier | unknown
 * Prisma:   void_html | sectioned_text | inline_dossier | unknown
 * domain:   void_html | text_export | inline_dossier | …
 *
 * Unknown stays unknown — never coerced to sectioned-text.
 */

import type { ReportFormatDb } from "./types.js";

export const PARSER_FORMATS = [
  "void-html",
  "sectioned-text",
  "inline-dossier",
  "unknown",
] as const;

export type ParserFormat = (typeof PARSER_FORMATS)[number];

export const SOURCE_MODES = [
  "void_html",
  "text_export",
  "inline_dossier",
  "telegram",
  "fio",
  "facesearch",
  "other",
] as const;

export type SourceMode = (typeof SOURCE_MODES)[number];

const PARSER_TO_DB: Record<string, ReportFormatDb> = {
  "void-html": "void_html",
  void_html: "void_html",
  "sectioned-text": "sectioned_text",
  sectioned_text: "sectioned_text",
  "inline-dossier": "inline_dossier",
  inline_dossier: "inline_dossier",
  unknown: "unknown",
};

const DB_TO_PARSER: Record<string, ParserFormat> = {
  void_html: "void-html",
  "void-html": "void-html",
  sectioned_text: "sectioned-text",
  "sectioned-text": "sectioned-text",
  inline_dossier: "inline-dossier",
  "inline-dossier": "inline-dossier",
  unknown: "unknown",
};

const TO_SOURCE_MODE: Record<string, SourceMode> = {
  "void-html": "void_html",
  void_html: "void_html",
  "sectioned-text": "text_export",
  sectioned_text: "text_export",
  text_export: "text_export",
  "inline-dossier": "inline_dossier",
  inline_dossier: "inline_dossier",
};

export function parserFormatToDb(format: string): ReportFormatDb {
  return PARSER_TO_DB[format] ?? "unknown";
}

/** Prisma / alias → parser hyphenated name. Unknown stays unknown. */
export function dbFormatToParser(format: string): ParserFormat {
  return DB_TO_PARSER[format] ?? "unknown";
}

export function formatToSourceMode(format: string): SourceMode {
  return TO_SOURCE_MODE[format] ?? "other";
}

/**
 * Normalize PersonSourceReport.mode to domain Person.sourceReports[].mode.
 * Accepts ReportFormat aliases so 360 Sources keep signal.
 */
export function normalizeSourceMode(
  mode: string | null | undefined,
): SourceMode | undefined {
  if (!mode) return undefined;
  if (mode in TO_SOURCE_MODE) return TO_SOURCE_MODE[mode];
  return (SOURCE_MODES as readonly string[]).includes(mode)
    ? (mode as SourceMode)
    : "other";
}
