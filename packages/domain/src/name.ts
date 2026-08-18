/**
 * Russian FIO split + likely-same-person matching (no numeric cutoff).
 * Used by the parser (intra-report) and merge suggestions (cross-person).
 */

export type ParsedName = {
  full: string;
  last?: string;
  first?: string;
  middle?: string;
};

function normToken(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase().replace(/ё/g, "е");
}

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
 * Exact FIO equality (case/whitespace-normalized).
 */
export function fioEquals(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return false;
  return normToken(a) === normToken(b);
}

function tokens(fio: string): string[] {
  return normToken(fio).split(" ").filter(Boolean);
}

/** True if every token of shorter is a prefix sequence of longer (order-preserving). */
function isTokenPrefix(shorter: string[], longer: string[]): boolean {
  if (shorter.length === 0 || shorter.length > longer.length) return false;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) return false;
  }
  return true;
}

/**
 * Likely same person:
 * - exact FIO match
 * - last+first match when one отчество is missing OR both middles match
 * - ordered token prefix (e.g. 2-token vs 3-token with same last+first)
 *
 * Conflicting middles (both present, different — Тестович vs Иванович)
 * are NOT same-person even if last+first match (Issue 11).
 */
export function isLikelySamePerson(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return false;
  if (fioEquals(a, b)) return true;

  const pa = parseFio(a);
  const pb = parseFio(b);

  if (
    pa.middle &&
    pb.middle &&
    normToken(pa.middle) !== normToken(pb.middle)
  ) {
    return false;
  }

  if (pa.last && pb.last && pa.first && pb.first) {
    if (
      normToken(pa.last) === normToken(pb.last) &&
      normToken(pa.first) === normToken(pb.first)
    ) {
      return true;
    }
  }

  const ta = tokens(a);
  const tb = tokens(b);
  if (isTokenPrefix(ta, tb) || isTokenPrefix(tb, ta)) return true;

  return false;
}
