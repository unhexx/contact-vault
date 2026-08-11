import { KNOWN_KEYS } from "./keyAliases.js";

export type InlineKvPair = {
  key: string;
  value: string;
};

const MAX_SCAN_LEN = 64 * 1024; // ReDoS / pathological safety cap

let _sortedCache: string[] | null = null;

/** Ordered longest → shortest known keys (Russian + Latin aliases). */
export function knownKeysSorted(): string[] {
  if (_sortedCache) return _sortedCache;
  _sortedCache = [...KNOWN_KEYS].sort((a, b) => b.length - a.length);
  return _sortedCache;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

/**
 * At position `i`, try longest known key match (case-insensitive, ё→е),
 * then optional spaces around `:`. Returns key display form + span.
 */
function matchKnownKeyAt(
  text: string,
  i: number,
  keys: string[],
): { key: string; keyStart: number; afterColon: number } | null {
  // Don't start mid-word
  if (i > 0) {
    const prev = text[i - 1]!;
    if (/[A-Za-zА-Яа-яЁё0-9_]/.test(prev)) return null;
  }

  const slice = text.slice(i);
  const normSlice = normalizeForMatch(slice);

  for (const key of keys) {
    const nk = normalizeForMatch(key);
    if (!normSlice.startsWith(nk)) continue;
    // After key: optional spaces, then colon
    let j = i + key.length;
    while (j < text.length && (text[j] === " " || text[j] === "\t")) j++;
    if (text[j] !== ":") continue;
    j++; // past colon
    return { key, keyStart: i, afterColon: j };
  }
  return null;
}

/**
 * Fallback unknown key: 1–6 letter-led tokens + colon + non-empty value.
 * Strict enough to avoid swallowing free-form FIO into a fake key.
 */
function matchUnknownKeyAt(
  text: string,
  i: number,
): { key: string; keyStart: number; afterColon: number } | null {
  if (i > 0) {
    const prev = text[i - 1]!;
    if (/[A-Za-zА-Яа-яЁё0-9_]/.test(prev)) return null;
  }

  const rest = text.slice(i);
  // Prefer Title-ish short keys (max ~40 chars, up to 4 words)
  const m =
    /^([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_./\-]{0,30}(?:\s+[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_./\-]{0,20}){0,3})\s*:\s*(?=\S)/.exec(
      rest,
    );
  if (!m) return null;
  const key = m[1]!.trim();
  if (key.length === 0 || key.length > 60) return null;
  // Reject keys that look like FIO (3+ capitalized tokens without digits)
  const words = key.split(/\s+/);
  if (
    words.length >= 3 &&
    words.every((w) => /^[A-ZА-ЯЁ][a-zа-яё]+$/.test(w) || /^[A-ZА-ЯЁ]+$/.test(w))
  ) {
    return null;
  }
  return { key, keyStart: i, afterColon: i + m[0].length };
}

type KeyHit = { key: string; keyStart: number; afterColon: number };

/**
 * Collect all key hits (known longest-first preferred; unknown fill gaps).
 */
function collectKeyHits(text: string, keys: string[]): KeyHit[] {
  const hits: KeyHit[] = [];
  const covered = new Array<boolean>(text.length).fill(false);

  // Pass 1: known keys — scan left to right, at each free index try longest known
  for (let i = 0; i < text.length; i++) {
    if (covered[i]) continue;
    const ch = text[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;

    const known = matchKnownKeyAt(text, i, keys);
    if (!known) continue;

    hits.push(known);
    for (let k = known.keyStart; k < known.afterColon; k++) covered[k] = true;
  }

  // Pass 2: unknown keys in gaps (not overlapping known key spans)
  for (let i = 0; i < text.length; i++) {
    if (covered[i]) continue;
    const ch = text[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;

    const unk = matchUnknownKeyAt(text, i);
    if (!unk) continue;
    // Skip if any part of key span is covered
    let overlap = false;
    for (let k = unk.keyStart; k < unk.afterColon; k++) {
      if (covered[k]) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    hits.push(unk);
    for (let k = unk.keyStart; k < unk.afterColon; k++) covered[k] = true;
  }

  hits.sort((a, b) => a.keyStart - b.keyStart);
  return hits;
}

/**
 * Tokenize inline "Key : Value" stream.
 * Greedy longest-key-first for known keys (case-insensitive, ё→е).
 * Value runs until next key hit or EOS.
 * Unknown Key: segments that look like Key : Value but key not in table → still emit.
 */
export function parseInlineKV(text: string): InlineKvPair[] {
  let input = text ?? "";
  if (input.length > MAX_SCAN_LEN) {
    input = input.slice(0, MAX_SCAN_LEN);
  }

  const keys = knownKeysSorted();
  const hits = collectKeyHits(input, keys);
  const pairs: InlineKvPair[] = [];

  for (let h = 0; h < hits.length; h++) {
    const hit = hits[h]!;
    const next = hits[h + 1];
    let valueEnd = next ? next.keyStart : input.length;

    // Also stop at double newlines
    const nl = input.indexOf("\n\n", hit.afterColon);
    if (nl >= 0 && nl < valueEnd) valueEnd = nl;

    let vs = hit.afterColon;
    while (vs < input.length && (input[vs] === " " || input[vs] === "\t")) vs++;

    const value = input.slice(vs, valueEnd).trim();
    pairs.push({ key: hit.key, value });
  }

  return pairs;
}
