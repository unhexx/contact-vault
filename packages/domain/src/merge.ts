import type { DocumentType } from "./identity-document.js";
import { isLikelySamePerson } from "./name.js";
import type { PersonDraft } from "./person.js";

/** lower + trim — sole emailNorm authority (KD12). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Document number normalization for exact-match keys (KD12).
 * - Digit-only RU identifiers (passport_ru, snils, inn, oms, birth_cert)
 * - Uppercase + strip spaces/separators for alphanumeric / foreign types
 */
export function normalizeDocumentNumber(type: string, number: string): string {
  const trimmed = number.trim();
  switch (type as DocumentType | string) {
    case "passport_ru":
    case "snils":
    case "inn":
    case "oms":
    case "birth_cert":
      return trimmed.replace(/\D/g, "");
    case "passport_foreign":
    case "driving_license":
    case "military":
    case "other":
    default:
      return trimmed.toUpperCase().replace(/[\s\-_.]/g, "");
  }
}

export type ExactMatchKey =
  | { kind: "phone"; e164: string }
  | { kind: "email"; value: string } // already normalizeEmail'd
  | { kind: "document"; type: string; number: string }; // number already numberNorm'd

function keyFingerprint(key: ExactMatchKey): string {
  switch (key.kind) {
    case "phone":
      return `phone:${key.e164}`;
    case "email":
      return `email:${key.value}`;
    case "document":
      return `document:${key.type}:${key.number}`;
  }
}

/**
 * Exact-match keys from a draft (KD3, KD12, KD15, KD21).
 * - Phones: only when e164 is defined (skip unnormalized raw-only)
 * - Emails: via normalizeEmail
 * - Documents: via normalizeDocumentNumber
 */
export function extractExactMatchKeys(draft: PersonDraft): ExactMatchKey[] {
  const seen = new Set<string>();
  const keys: ExactMatchKey[] = [];

  const push = (key: ExactMatchKey): void => {
    const fp = keyFingerprint(key);
    if (seen.has(fp)) return;
    // Skip empty normalized values
    if (key.kind === "phone" && !key.e164) return;
    if (key.kind === "email" && !key.value) return;
    if (key.kind === "document" && !key.number) return;
    seen.add(fp);
    keys.push(key);
  };

  for (const cp of draft.contactPoints) {
    if (cp.kind === "phone") {
      // KD15: raw-only / blank e164 are not match keys
      const e164 = cp.e164?.trim();
      if (e164) {
        push({ kind: "phone", e164 });
      }
    } else if (cp.kind === "email") {
      push({ kind: "email", value: normalizeEmail(cp.value) });
    }
  }

  for (const doc of draft.documents) {
    push({
      kind: "document",
      type: doc.type,
      number: normalizeDocumentNumber(doc.type, doc.number),
    });
  }

  return keys;
}

export type ExactMatchHit = {
  field: "phone" | "email" | "document";
  value: string;
};

/**
 * Score which exact keys from a draft hit a candidate's stored norms.
 * Value strings in hits are the draft-key normalized forms.
 *
 * Defense in depth: candidate emails and document numbers are re-normalized
 * via `normalizeEmail` / `normalizeDocumentNumber` so callers may pass display
 * or already-normed values. Phones are compared as e164 strings (trim only).
 */
export function scoreExactMatches(
  draftKeys: ExactMatchKey[],
  candidate: {
    phones: string[]; // e164 list (trimmed for compare)
    emails: string[]; // emailNorm or display — re-normalized
    documents: Array<{ type: string; number: string }>; // numberNorm or raw — re-normalized
  },
): ExactMatchHit[] {
  const phoneSet = new Set(
    candidate.phones.map((p) => p.trim()).filter(Boolean),
  );
  const emailSet = new Set(candidate.emails.map(normalizeEmail));
  const docSet = new Set(
    candidate.documents.map(
      (d) => `${d.type}:${normalizeDocumentNumber(d.type, d.number)}`,
    ),
  );

  const hits: ExactMatchHit[] = [];
  const seen = new Set<string>();

  for (const key of draftKeys) {
    let hit: ExactMatchHit | undefined;
    switch (key.kind) {
      case "phone":
        if (phoneSet.has(key.e164)) {
          hit = { field: "phone", value: key.e164 };
        }
        break;
      case "email":
        if (emailSet.has(key.value)) {
          hit = { field: "email", value: key.value };
        }
        break;
      case "document": {
        const fp = `${key.type}:${key.number}`;
        if (docSet.has(fp)) {
          hit = { field: "document", value: `${key.type}:${key.number}` };
        }
        break;
      }
    }
    if (hit) {
      const id = `${hit.field}:${hit.value}`;
      if (!seen.has(id)) {
        seen.add(id);
        hits.push(hit);
      }
    }
  }

  return hits;
}

export type MatchedOnKind = "phone" | "email" | "document" | "name" | "dob";

export type MatchHit = {
  field: MatchedOnKind;
  value: string;
};

export type MatchCandidate = {
  personId: string;
  matchedOn: MatchHit[];
};

/**
 * Normalize DOB for prefix-compatible matching.
 * Accepts ISO YYYY[-MM[-DD]] and common RU DD.MM.YYYY / MM.YYYY / YYYY.
 */
export function normalizeDobForMatch(input: string): string | undefined {
  const s = input.trim();
  if (!s) return undefined;

  const iso = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (iso) {
    if (iso[3]) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (iso[2]) return `${iso[1]}-${iso[2]}`;
    return iso[1];
  }

  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }

  const my = s.match(/^(\d{1,2})[./](\d{4})$/);
  if (my) {
    return `${my[2]}-${my[1]!.padStart(2, "0")}`;
  }

  if (/^\d{4}$/.test(s)) return s;

  return s;
}

/**
 * Compatible partial DOBs: equal, or one is a hyphen-boundary prefix of the other.
 * Missing either side → not compatible. Conflicting full/month dates → not compatible.
 */
export function dobsCompatible(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizeDobForMatch(a);
  const nb = normalizeDobForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(`${nb}-`) || nb.startsWith(`${na}-`);
}

export function collectPersonNames(input: {
  canonicalName?: { full?: string };
  canonicalFull?: string | null;
  nameVariants?: Array<{ full?: string }>;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string | null) => {
    const t = raw?.trim();
    if (!t) return;
    const key = t.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  push(input.canonicalName?.full);
  push(input.canonicalFull);
  for (const nv of input.nameVariants ?? []) push(nv.full);
  return out;
}

/**
 * Name + compatible partial DOB matching rule.
 * Missing DOB on either side → no hit. Conflicting dates → no hit.
 * Name-only is never enough. Emits `name` and `dob` (no merge).
 */
export function scoreNameDobMatch(
  draft: { names: string[]; dateOfBirth?: string },
  candidate: { names: string[]; dateOfBirth?: string },
): MatchHit[] {
  if (!dobsCompatible(draft.dateOfBirth, candidate.dateOfBirth)) return [];

  let matchedName: string | undefined;
  for (const a of draft.names) {
    for (const b of candidate.names) {
      if (isLikelySamePerson(a, b)) {
        matchedName = a;
        break;
      }
    }
    if (matchedName) break;
  }
  if (!matchedName) return [];

  const draftDob = normalizeDobForMatch(draft.dateOfBirth!) ?? draft.dateOfBirth!;
  const candDob =
    normalizeDobForMatch(candidate.dateOfBirth!) ?? candidate.dateOfBirth!;
  const dobValue = candDob.length > draftDob.length ? candDob : draftDob;

  return [
    { field: "name", value: matchedName },
    { field: "dob", value: dobValue },
  ];
}

/** Union match lists by personId; dedupe matchedOn field+value. */
export function unionMatchCandidates(
  ...lists: MatchCandidate[][]
): MatchCandidate[] {
  const byPerson = new Map<string, Map<string, MatchHit>>();
  for (const list of lists) {
    for (const c of list) {
      let hits = byPerson.get(c.personId);
      if (!hits) {
        hits = new Map();
        byPerson.set(c.personId, hits);
      }
      for (const hit of c.matchedOn) {
        const id = `${hit.field}:${hit.value}`;
        if (!hits.has(id)) hits.set(id, hit);
      }
    }
  }
  const result: MatchCandidate[] = [];
  for (const [personId, hits] of byPerson) {
    result.push({ personId, matchedOn: Array.from(hits.values()) });
  }
  return result;
}
