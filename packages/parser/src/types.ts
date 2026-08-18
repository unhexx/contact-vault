import type { PersonDraft, Relationship } from "@contact-vault/domain";

/** Supported report formats (v0.1.1 includes inline-dossier). */
export type ReportFormat =
  | "void-html"
  | "sectioned-text"
  | "inline-dossier"
  | "unknown";

export type ReportMeta = {
  /** Must equal contentHashOf(content) from @contact-vault/domain (KD13). */
  contentHash: string;
  reportQuery?: string;
  filename?: string;
  detectedAt: string; // ISO-8601
};

export type ParseWarning = {
  code: string; // UNKNOWN_KEY | AMBIGUOUS_RECORD | EMPTY_SECTION | PHONE_UNNORMALIZED | UNMAPPED_SECTION | EMBED_MISSING | SCORING_ONLY_NO_PERSON | ...
  message: string;
  section?: string;
  key?: string;
  severity: "info" | "warn" | "error";
};

export type ParseResult = {
  format: ReportFormat;
  reportMeta: ReportMeta;
  /**
   * Primary drafts; relationships/riskScores/incidents MUST live on each draft (KD27, KD38).
   * Typically 0 or 1 primary person (KD17).
   */
  persons: PersonDraft[];
  /**
   * Top-level mirror only — ingestion IGNORES this for persistence.
   * Prefer `persons[0].relationships` as authority; set top-level equal for test parity.
   */
  relationships: Relationship[];
  warnings: ParseWarning[];
};

export type ParseReportInput = {
  content: string;
  filename?: string;
  /** ReportImport UUID; all Provenance.reportId must equal this (KD16). */
  reportId: string;
};
