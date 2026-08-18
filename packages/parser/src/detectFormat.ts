import type { ReportFormat } from "./types.js";

/** KD37 — locked detect constants (use only these). */
export const SECTIONED_LINE_KV_RATIO = 0.5;
export const DETECT_SAMPLE_WINDOW = 8192;
export const INLINE_IMYA_MIN_ALONE = 2;
export const INLINE_IMYA_MIN_WITH_KEYS = 1;
export const INLINE_KEY_MIN = 4;
/** Per-line sectioned KV (start of line; value non-empty). */
export const LINE_ORIENTED_KV_RE = /^[^:\n]{1,80}:\s*\S/;
/**
 * Inline multi-key line: ≥2 key patterns on one line.
 * Key pattern: optional lead space/equals, word(s), colon, non-empty value start.
 */
export const INLINE_MULTI_KEY_LINE_RE =
  /(?:^|[\s=])([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_./\-]*(?:\s+[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_./\-]*){0,6})\s*:\s*\S/g;

const SECTION_HEADER_LINE_RE = /^===\s*(.+?)\s*===\s*$/;
const SCORING_MARKER_RE =
  /Результаты\s+скоринга|Общий\s+показатель\s*:/i;
const IMYA_RE = /Имя\s*:/gi;
const KEY_COLON_RE = /[^\n:]{1,80}\s*:\s*\S/g;
const DOHODY_BLOCK_RE = /====\s*Доходы\s*====/i;
const ADRESA_BLOCK_RE = /====\s*Адреса\s*====/i;

function isVoidHtml(text: string, lowerName: string): boolean {
  return (
    /<!DOCTYPE\s+html/i.test(text) ||
    /__report_embed__/i.test(text) ||
    (/\.html?$/.test(lowerName) && /<html[\s>]/i.test(text))
  );
}

/** Count Key: patterns on a single line (for multi-key-inline detection). */
export function countKeysOnLine(line: string): number {
  const re = new RegExp(INLINE_MULTI_KEY_LINE_RE.source, "g");
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    count++;
    // Avoid zero-length loops
    if (m[0].length === 0) re.lastIndex++;
  }
  return count;
}

/**
 * Clean sectioned = prefer-sectioned rule (mapping doc / KD41).
 * Do NOT call isInlineDensity here — density runs only inside isInlineDossier.
 */
export function isSectionedTextClean(text: string): boolean {
  if (!text || SCORING_MARKER_RE.test(text)) return false;

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let headerCount = 0;
  let contentLines = 0;
  let singleKeyKvLines = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SECTION_HEADER_LINE_RE.test(trimmed)) {
      headerCount++;
      continue;
    }
    contentLines++;
    if (
      LINE_ORIENTED_KV_RE.test(trimmed) &&
      countKeysOnLine(trimmed) <= 1
    ) {
      singleKeyKvLines++;
    }
  }

  if (headerCount < 1) return false;
  if (singleKeyKvLines === 0) return false; // headers-only
  if (contentLines === 0) return false;

  return singleKeyKvLines / contentLines >= SECTIONED_LINE_KV_RATIO;
}

/**
 * Density heuristic — ONLY used by isInlineDossier path C (after clean failed).
 */
export function isInlineDensity(text: string): boolean {
  const window = text.slice(0, DETECT_SAMPLE_WINDOW);
  const imyaMatches = window.match(IMYA_RE);
  const imyaCount = imyaMatches?.length ?? 0;
  // Reset lastIndex side effects from global flag via match (ok)

  const keyMatches = window.match(KEY_COLON_RE);
  const keyColonCount = keyMatches?.length ?? 0;

  return (
    imyaCount >= INLINE_IMYA_MIN_ALONE ||
    (imyaCount >= INLINE_IMYA_MIN_WITH_KEYS &&
      keyColonCount >= INLINE_KEY_MIN)
  );
}

/**
 * Evaluated only after isSectionedTextClean returned false.
 * ANY of: scoring, blocks+Имя, density.
 */
export function isInlineDossier(text: string): boolean {
  if (!text) return false;

  // A. Scoring markers
  if (SCORING_MARKER_RE.test(text)) return true;

  // B. Block + name
  const hasBlock = DOHODY_BLOCK_RE.test(text) || ADRESA_BLOCK_RE.test(text);
  if (hasBlock) {
    const imyaCount = (text.match(IMYA_RE) ?? []).length;
    if (imyaCount >= 1) return true;
  }

  // C. Density (never gates clean sectioned — KD41)
  return isInlineDensity(text);
}

/**
 * Detect report format from content (+ optional filename for void-html only).
 * Exclusive order (KD24): void-html → isSectionedTextClean → isInlineDossier → unknown.
 * No weak `.txt` + header fallback (KD25).
 */
export function detectFormat(input: string, filename?: string): ReportFormat {
  const text = input ?? "";
  const lowerName = (filename ?? "").toLowerCase();

  // 1. void-html
  if (isVoidHtml(text, lowerName)) return "void-html";

  // 2. clean sectioned only — NO weak .txt fallback
  if (isSectionedTextClean(text)) return "sectioned-text";

  // 3. inline-dossier
  if (isInlineDossier(text)) return "inline-dossier";

  // 4.
  return "unknown";
}
