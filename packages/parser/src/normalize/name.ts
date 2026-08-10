/**
 * Russian FIO split: always keep full; split into last/first/middle when 3 tokens.
 * Same-person detection for KD17 multi-record (token subset / last+first).
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
export function fioEquals(a: string | undefined, b: string | undefined): boolean {
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

  // Both middles present and unequal → different people (do not short-circuit same)
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
      // last+first same AND (one middle missing OR both equal — conflict handled above)
      return true;
    }
  }

  const ta = tokens(a);
  const tb = tokens(b);
  // Token prefix only when not already ruled out by conflicting middles
  if (isTokenPrefix(ta, tb) || isTokenPrefix(tb, ta)) return true;

  return false;
}

export type RelatedPersonVerdict =
  | { kind: "same" }
  | { kind: "related"; reason: string }
  | { kind: "ambiguous"; reason: string };

/**
 * KD17 classification for multi-record identity.
 *
 * - same: apply facts to primary (incl. name variants / missing отчество)
 * - related: emit Relationship only; do not absorb documents
 * - ambiguous: treat as related + caller may emit AMBIGUOUS_RECORD
 *
 * Related when FIO is clearly non-overlapping (not a token subset / last+first)
 * and/or both DOBs present and unequal. Design: “FIO+DOB clearly differ.”
 */
export function classifyRelatedPerson(
  primaryFio: string | undefined,
  primaryDob: string | undefined,
  fio: string | undefined,
  dob: string | undefined,
): RelatedPersonVerdict {
  if (!primaryFio || !fio) return { kind: "same" };
  if (isLikelySamePerson(primaryFio, fio)) return { kind: "same" };

  const bothDob = Boolean(primaryDob && dob);
  const dobDiffers = bothDob && primaryDob !== dob;
  const dobMatches = bothDob && primaryDob === dob;

  // Clearly different FIO (not subset) + different DOB → related
  if (dobDiffers) {
    return { kind: "related", reason: "distinct FIO and DOB" };
  }

  // Distinct FIO with matching DOB → related but flag ambiguity (twins / data quirk)
  if (dobMatches) {
    return {
      kind: "ambiguous",
      reason: "distinct FIO but matching DOB",
    };
  }

  // Distinct FIO, incomplete DOB evidence → still related (clear non-overlap)
  return {
    kind: "related",
    reason: "distinct FIO (not a name variant of primary)",
  };
}
