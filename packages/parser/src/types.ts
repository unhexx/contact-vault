import type { PersonDraft, Relationship } from "@contact-vault/domain";

/** v0.1 formats (KD8). inline-dossier deferred. */
export type ReportFormat = "void-html" | "sectioned-text" | "unknown";

export type ReportMeta = {
  /** Must equal contentHashOf(content) from @contact-vault/domain (KD13). */
  contentHash: string;
  reportQuery?: string;
  filename?: string;
  detectedAt: string; // ISO-8601
};

export type ParseWarning = {
  code: string; // UNKNOWN_KEY | AMBIGUOUS_RECORD | EMPTY_SECTION | PHONE_UNNORMALIZED | UNMAPPED_SECTION | EMBED_MISSING | ...
  message: string;
  section?: string;
  key?: string;
  severity: "info" | "warn" | "error";
};

export type ParseResult = {
  format: ReportFormat;
  reportMeta: ReportMeta;
  /** v0.1: typically 0 or 1 primary person (KD17). */
  persons: PersonDraft[];
  /** Top-level optional; prefer nested under persons[].relationships. */
  relationships: Relationship[];
  warnings: ParseWarning[];
};

export type ParseReportInput = {
  content: string;
  filename?: string;
  /** ReportImport UUID; all Provenance.reportId must equal this (KD16). */
  reportId: string;
};
