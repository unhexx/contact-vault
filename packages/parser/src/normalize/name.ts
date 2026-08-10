/**
 * Russian FIO split: always keep full; split into last/first/middle when 3 tokens.
 */

export type ParsedName = {
  full: string;
  last?: string;
  first?: string;
  middle?: string;
};

/**
 * Parse a free-form FIO string.
 * Russian convention: Фамилия Имя Отчество (last first middle).
 */
export function parseFio(input: string): ParsedName {
  const full = input.trim().replace(/\s+/g, " ");
  if (!full) {
    return { full: input };
  }

  const parts = full.split(" ").filter(Boolean);
  if (parts.length === 3) {
    return {
      full,
      last: parts[0],
      first: parts[1],
      middle: parts[2],
    };
  }
  if (parts.length === 2) {
    return {
      full,
      last: parts[0],
      first: parts[1],
    };
  }
  if (parts.length === 1) {
    return { full, last: parts[0] };
  }
  // 4+ tokens: keep full only (patronymic compounds / extras)
  return { full };
}

/**
 * Compare two FIO strings for "clearly different person" (KD17 multi-record).
 * Case-insensitive, whitespace-normalized.
 */
export function fioEquals(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
}
