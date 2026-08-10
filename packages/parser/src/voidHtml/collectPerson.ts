import type {
  Address,
  ContactPoint,
  IdentityDocument,
  NameVariant,
  PersonDraft,
  Relationship,
} from "@contact-vault/domain";
import { mapDocumentType, normalizeDate, normalizePhone, parseFio } from "../normalize/index.js";
import { makeProvenance } from "../provenance.js";
import type { ParseWarning } from "../types.js";

export type CollectContext = {
  reportId: string;
  reportQuery?: string;
  extractedAt: string;
  sourceName: string;
};

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Known data.* keys that collectors handle. */
const MAPPED_DATA_KEYS = new Set([
  "profile",
  "profile_all",
  "documents",
  "addresses",
  "connections",
  "family",
  "social_profiles",
]);

export type CollectPersonResult = {
  person: PersonDraft | null;
  reportQuery?: string;
  warnings: ParseWarning[];
};

/**
 * Map Appendix A embed tree → single PersonDraft + warnings.
 * connections/family → Relationship + relatedPersonHint only (KD17).
 */
export function collectPersonFromEmbed(
  embed: unknown,
  ctx: CollectContext,
): CollectPersonResult {
  const warnings: ParseWarning[] = [];
  if (!isRecord(embed)) {
    warnings.push({
      code: "EMBED_INVALID",
      message: "Embed root is not an object",
      severity: "error",
    });
    return { person: null, warnings };
  }

  const query = asString(embed.query) ?? ctx.reportQuery;
  const data = isRecord(embed.data) ? embed.data : {};

  // Unmapped top-level data keys
  for (const key of Object.keys(data)) {
    if (!MAPPED_DATA_KEYS.has(key)) {
      warnings.push({
        code: "UNMAPPED_SECTION",
        message: `Unmapped data section "${key}" (not collected in v0.1)`,
        section: key,
        key,
        severity: "info",
      });
    }
  }

  const profile = isRecord(data.profile)
    ? data.profile
    : isRecord(data.profile_all)
      ? data.profile_all
      : {};

  const provBase = {
    reportId: ctx.reportId,
    reportQuery: query,
    sourceName: ctx.sourceName,
    extractedAt: ctx.extractedAt,
  };

  const contactPoints: ContactPoint[] = [];
  const documents: IdentityDocument[] = [];
  const addresses: Address[] = [];
  const relationships: Relationship[] = [];
  const nameVariants: NameVariant[] = [];
  let dateOfBirth: string | undefined;
  let placeOfBirth: string | undefined;
  let canonicalName: NameVariant | undefined;

  // --- profile ---
  const fio = asString(profile.fio);
  if (fio) {
    const parsed = parseFio(fio);
    canonicalName = {
      full: parsed.full,
      ...(parsed.last ? { last: parsed.last } : {}),
      ...(parsed.first ? { first: parsed.first } : {}),
      ...(parsed.middle ? { middle: parsed.middle } : {}),
      provenance: [
        makeProvenance({
          ...provBase,
          section: "profile",
          originalKey: "fio",
          originalValue: fio,
          confidence: 1,
        }),
      ],
    };
    nameVariants.push(canonicalName);
  }

  const dobRaw = asString(profile.dob) ?? asString(profile.date_of_birth);
  if (dobRaw) {
    dateOfBirth = normalizeDate(dobRaw) ?? dobRaw;
  }

  const birthPlace =
    asString(profile.birth_place) ?? asString(profile.place_of_birth);
  if (birthPlace) placeOfBirth = birthPlace;

  const phoneRaw = asString(profile.phone);
  if (phoneRaw) {
    const n = normalizePhone(phoneRaw);
    if (n.ok) {
      contactPoints.push({
        kind: "phone",
        e164: n.e164,
        raw: n.raw,
        provenance: [
          makeProvenance({
            ...provBase,
            section: "profile",
            originalKey: "phone",
            originalValue: phoneRaw,
          }),
        ],
      });
    } else {
      contactPoints.push({
        kind: "phone",
        raw: n.raw,
        provenance: [
          makeProvenance({
            ...provBase,
            section: "profile",
            originalKey: "phone",
            originalValue: phoneRaw,
            confidence: 0.5,
          }),
        ],
      });
      warnings.push({
        code: "PHONE_UNNORMALIZED",
        message: `Could not normalize phone to E.164: ${phoneRaw}`,
        section: "profile",
        key: "phone",
        severity: "warn",
      });
    }
  }

  const emailRaw = asString(profile.email);
  if (emailRaw) {
    contactPoints.push({
      kind: "email",
      value: emailRaw,
      provenance: [
        makeProvenance({
          ...provBase,
          section: "profile",
          originalKey: "email",
          originalValue: emailRaw,
        }),
      ],
    });
  }

  // Unknown profile keys → extras later
  const knownProfileKeys = new Set([
    "fio",
    "phone",
    "email",
    "dob",
    "date_of_birth",
    "birth_place",
    "place_of_birth",
  ]);
  const profileExtras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (!knownProfileKeys.has(k)) {
      profileExtras[k] = v;
      warnings.push({
        code: "UNKNOWN_KEY",
        message: `Unknown profile key "${k}"`,
        section: "profile",
        key: k,
        severity: "info",
      });
    }
  }

  // --- documents ---
  for (const item of asArray(data.documents)) {
    if (!isRecord(item)) continue;
    const typeRaw = asString(item.type) ?? "other";
    const number = asString(item.number);
    if (!number) {
      warnings.push({
        code: "EMPTY_SECTION",
        message: "Document entry missing number",
        section: "documents",
        severity: "warn",
      });
      continue;
    }
    const type = mapDocumentType(typeRaw);
    const issuedAtRaw =
      asString(item.issue_date) ?? asString(item.issued_at) ?? asString(item.issuedAt);
    const issuedBy =
      asString(item.issued_by) ?? asString(item.issuedBy);
    const departmentCode =
      asString(item.department_code) ?? asString(item.departmentCode);

    const doc: IdentityDocument = {
      type,
      number,
      provenance: [
        makeProvenance({
          ...provBase,
          section: "documents",
          originalKey: typeRaw,
          originalValue: number,
        }),
      ],
    };
    if (issuedAtRaw) doc.issuedAt = normalizeDate(issuedAtRaw) ?? issuedAtRaw;
    if (issuedBy) doc.issuedBy = issuedBy;
    if (departmentCode) doc.departmentCode = departmentCode;
    documents.push(doc);
  }

  // --- addresses ---
  for (const item of asArray(data.addresses)) {
    if (!isRecord(item)) continue;
    const raw = asString(item.raw) ?? asString(item.address);
    if (!raw) continue;
    const typeRaw = (asString(item.type) ?? asString(item.category) ?? "other").toLowerCase();
    const categoryMap: Record<string, Address["category"]> = {
      registration: "registration",
      residence: "residence",
      delivery: "delivery",
      work: "work",
      other: "other",
      регистрация: "registration",
      проживание: "residence",
    };
    const category = categoryMap[typeRaw] ?? "other";
    addresses.push({
      raw,
      category,
      provenance: [
        makeProvenance({
          ...provBase,
          section: "addresses",
          originalKey: typeRaw,
          originalValue: raw,
        }),
      ],
    });
  }

  // --- social_profiles ---
  for (const item of asArray(data.social_profiles)) {
    if (!isRecord(item)) continue;
    const network = (asString(item.network) ?? "unknown").toLowerCase();
    const username = asString(item.username);
    const url = asString(item.url);
    const messengers = new Set(["telegram", "whatsapp", "viber", "max", "signal"]);
    if (messengers.has(network) && (username || url)) {
      const identifier = username ?? url ?? network;
      contactPoints.push({
        kind: "messenger",
        network,
        identifier,
        provenance: [
          makeProvenance({
            ...provBase,
            section: "social_profiles",
            originalKey: network,
            originalValue: identifier,
          }),
        ],
      });
    } else {
      contactPoints.push({
        kind: "social",
        network,
        ...(username ? { username } : {}),
        ...(url ? { url } : {}),
        provenance: [
          makeProvenance({
            ...provBase,
            section: "social_profiles",
            originalKey: network,
            originalValue: username ?? url ?? network,
          }),
        ],
      });
    }
  }

  // --- connections / family → Relationship only (KD17) ---
  const connectionItems = [
    ...asArray(data.connections),
    ...asArray(data.family),
  ];
  for (const item of connectionItems) {
    if (!isRecord(item)) continue;
    const relFio = asString(item.fio) ?? asString(item.name);
    const relDob = asString(item.dob);
    const relation = asString(item.relation) ?? asString(item.type) ?? "related";
    relationships.push({
      type: "family",
      relationLabel: relation,
      relatedPersonHint: {
        ...(relFio ? { fio: relFio } : {}),
        ...(relDob ? { dob: normalizeDate(relDob) ?? relDob } : {}),
      },
      provenance: [
        makeProvenance({
          ...provBase,
          section: "connections",
          originalKey: relation,
          originalValue: relFio ?? "",
        }),
      ],
    });
  }

  const hasAny =
    canonicalName ||
    contactPoints.length > 0 ||
    documents.length > 0 ||
    addresses.length > 0 ||
    relationships.length > 0 ||
    dateOfBirth ||
    placeOfBirth;

  if (!hasAny) {
    return { person: null, reportQuery: query, warnings };
  }

  const person: PersonDraft = {
    nameVariants,
    contactPoints,
    documents,
    addresses,
    relationships,
  };
  if (canonicalName) person.canonicalName = canonicalName;
  if (dateOfBirth) person.dateOfBirth = dateOfBirth;
  if (placeOfBirth) person.placeOfBirth = placeOfBirth;
  if (Object.keys(profileExtras).length > 0) {
    person.extras = { profile: profileExtras };
  }

  return { person, reportQuery: query, warnings };
}
