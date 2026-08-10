import type { ReportFormat } from "./types.js";

const SECTION_HEADER_RE = /^===\s*(.+?)\s*===\s*$/m;
const KEY_VALUE_RE = /^[^:\n]{1,80}:\s*.+$/m;

/**
 * Detect report format from content (+ optional filename hint).
 * Priority: void-html → sectioned-text → unknown.
 * v0.1: no inline-dossier branch (TODO → ADR-003 / v0.2+).
 */
export function detectFormat(input: string, filename?: string): ReportFormat {
  const text = input ?? "";
  const lowerName = (filename ?? "").toLowerCase();

  // Priority 1: Void HTML SPA / embed markers
  if (
    /<!DOCTYPE\s+html/i.test(text) ||
    /__report_embed__/i.test(text) ||
    /__REPORT_EMBED__/.test(text) ||
    (/\.html?$/.test(lowerName) && /<html[\s>]/i.test(text))
  ) {
    return "void-html";
  }

  // Priority 2: sectioned plain text with === headers + mostly Key: value lines
  if (SECTION_HEADER_RE.test(text) && KEY_VALUE_RE.test(text)) {
    return "sectioned-text";
  }

  // Filename-only weak hints when content is sparse
  if (/\.html?$/.test(lowerName) && /<html[\s>]/i.test(text)) {
    return "void-html";
  }
  if (/\.txt$/i.test(lowerName) && SECTION_HEADER_RE.test(text)) {
    return "sectioned-text";
  }

  // TODO(v0.2+): inline-dossier — scoring header / dense inline "Key : Value" (ADR-003)
  return "unknown";
}
