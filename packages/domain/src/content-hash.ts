import { createHash } from "node:crypto";

/**
 * Mandatory, exhaustive normalization before hashing.
 * Rules are fixed — not optional — so OS/line-ending variance cannot break idempotency.
 *
 * Authority: KD13 — sole content-hash implementation for the monorepo.
 */
export function normalizeReportContent(content: string): string {
  // 1. Strip UTF-8 BOM if present
  let s = content.startsWith("\uFEFF") ? content.slice(1) : content;
  // 2. Normalize newlines to LF only (CRLF / CR → LF)
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // 3. Do NOT apply NFKC / trim of trailing content (preserve significant spaces inside reports)
  // 4. Do NOT re-encode; input is already a JS UTF-16 string representing UTF-8 file text
  return s;
}

/** SHA-256 hex digest of UTF-8 bytes of normalizeReportContent(content). */
export function contentHashOf(content: string): string {
  const normalized = normalizeReportContent(content);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
