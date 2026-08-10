/**
 * Parse Key: value lines into records within a section body.
 * A blank line or repeated primary key (ФИО / Телефон) starts a new record.
 */

export type KvPair = {
  key: string;
  value: string;
  lineIndex: number;
};

export type TextRecord = {
  pairs: KvPair[];
};

const KV_RE = /^([^:]{1,120}):\s*(.*)$/;

/**
 * Record-boundary keys. ФИО starts a new person record.
 * Do NOT treat Телефон as boundary — family multi-records often share the query phone
 * (Report-Mapping: shared phone alone is not identity; KD17).
 * Blank lines also separate records.
 */
const PRIMARY_KEYS = new Set(["фио", "имя"]);

function isPrimaryKey(key: string): boolean {
  const n = key.trim().toLowerCase().replace(/ё/g, "е");
  if (PRIMARY_KEYS.has(n)) return true;
  if (n.startsWith("фио")) return true;
  return false;
}

/**
 * Split multi-value comma-separated fields when appropriate.
 * Does not split values that look like addresses (contain "ул." / "д." etc.).
 */
export function splitMultiValues(value: string, keyHint?: string): string[] {
  const v = value.trim();
  if (!v) return [];
  // Do not split addresses on commas
  if (
    keyHint &&
    /адрес/i.test(keyHint)
  ) {
    return [v];
  }
  // SNILS-like single values with spaces
  if (/^\d{3}-\d{3}-\d{3}\s+\d{2}$/.test(v)) {
    return [v];
  }
  // Split on comma when list-like
  if (v.includes(",")) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [v];
}

export function parseRecords(body: string): TextRecord[] {
  const lines = body.split("\n");
  const records: TextRecord[] = [];
  let current: KvPair[] = [];
  let seenPrimary = false;

  const push = () => {
    if (current.length > 0) {
      records.push({ pairs: current });
      current = [];
      seenPrimary = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      // blank line separates records when we already have pairs
      if (current.length > 0) push();
      continue;
    }
    const m = KV_RE.exec(trimmed);
    if (!m) {
      // continuation line? append to last value
      if (current.length > 0) {
        const last = current[current.length - 1]!;
        last.value = `${last.value} ${trimmed}`.trim();
      }
      continue;
    }
    const key = m[1]!.trim();
    const value = m[2]!.trim();

    if (isPrimaryKey(key) && seenPrimary && current.length > 0) {
      push();
    }
    if (isPrimaryKey(key)) seenPrimary = true;

    current.push({ key, value, lineIndex: i });
  }
  push();
  return records;
}
