/**
 * Russian FIO helpers: domain owns parse/same-person; parser keeps KD17 classify.
 */
export {
  fioEquals,
  isLikelySamePerson,
  parseFio,
  type ParsedName,
} from "@contact-vault/domain";

import { isLikelySamePerson } from "@contact-vault/domain";

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
