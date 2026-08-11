import type { ParseWarning } from "../types.js";

export type InlineRawRecord = {
  /** Tokens immediately preceding ==== Имя or free-text label before Имя : */
  sourceLabel: string;
  /** Text starting at first value after Имя : through next record boundary */
  body: string;
  /** Full match offset for debugging */
  startIndex: number;
};

const IMYA_SPLIT_RE = /(?:={3,}\s*)?Имя\s*:/gi;

/**
 * Capture source label from text immediately before an Имя : match.
 * Prefer non-empty tokens between previous record end and current match;
 * strip trailing ====; empty → caller uses "inline-record".
 */
function captureSourceLabel(preceding: string): string {
  // Only consider a trailing window (avoids whole scoring header as label)
  const tail = preceding.slice(-240);
  // Remove equals runs and collapse whitespace
  const cleaned = tail
    .replace(/={3,}/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const tokens = cleaned.split(" ").filter(Boolean);
  // Prefer last token that looks like a source name (has letters)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!.replace(/=+$/g, "").trim();
    if (t.length >= 2 && /[A-Za-zА-Яа-яЁё]/.test(t) && !/^\d+$/.test(t)) {
      // Skip common noise from address/income tails
      if (/^(г\.|ул\.|д\.|кв\.|обл\.|край|респ\.|ооо|ип)$/i.test(t)) continue;
      if (/^\d{4}$/.test(t)) continue; // year
      return t;
    }
  }
  const last = tokens[tokens.length - 1]?.replace(/=+$/g, "").trim() ?? "";
  return last;
}

/**
 * Split on /(?:={3,}\s*)?Имя\s*:/g — keep delimiter context for source label capture.
 */
export function splitRecords(
  text: string,
  warnings?: ParseWarning[],
): InlineRawRecord[] {
  const records: InlineRawRecord[] = [];
  const re = new RegExp(IMYA_SPLIT_RE.source, "gi");
  const matches: Array<{ index: number; length: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const next = matches[i + 1];
    const bodyStart = match.index + match.length;
    const bodyEnd = next ? next.index : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();

    const prevEnd =
      i === 0 ? 0 : matches[i - 1]!.index + matches[i - 1]!.length;
    const preceding = text.slice(prevEnd, match.index);
    let sourceLabel = captureSourceLabel(preceding);

    if (!sourceLabel) {
      sourceLabel = "inline-record";
      warnings?.push({
        code: "MISSING_SOURCE_LABEL",
        message: "Record without preceding source token",
        severity: "info",
      });
    }

    if (body) {
      records.push({
        sourceLabel,
        body,
        startIndex: match.index,
      });
    }
  }

  return records;
}
