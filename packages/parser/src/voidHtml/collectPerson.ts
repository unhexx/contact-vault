import type {
  Address,
  BankRelation,
  ContactPoint,
  Employment,
  FinancialFact,
  IdentityDocument,
  NameVariant,
  PersonDraft,
  Relationship,
  Vehicle,
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

function asFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
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
  "banks",
  "vehicles",
  "autoregs",
  "work",
  "companies",
  "finance",
]);

const KNOWN_BANK_KEYS = new Set([
  "name",
  "bank",
  "bank_name",
  "bankName",
  "title",
  "account",
  "account_number",
  "accountHint",
  "account_hint",
  "account_no",
  "role",
  "bik",
  "bic",
]);

const KNOWN_VEHICLE_KEYS = new Set([
  "brand",
  "mark",
  "make",
  "vendor",
  "model",
  "year",
  "year_issue",
  "yearIssue",
  "plate",
  "reg_num",
  "regNum",
  "regnum",
  "reg_number",
  "regNumber",
  "number",
  "gosnomer",
  "gos_nomer",
  "license_plate",
  "licensePlate",
  "vin",
  "body_number",
  "bodyNumber",
  "power",
  "powerHp",
  "power_hp",
  "hp",
  "volume",
  "engineVolume",
  "engine_volume",
  "engineVolumeCc",
  "cc",
  "category",
  "category_ts",
  "from",
  "to",
  "date_from",
  "dateFrom",
  "date_to",
  "dateTo",
  "owner",
  "ownerName",
  "owner_name",
  "operation",
  "operationCode",
  "operation_code",
  "ownershipPeriods",
  "ownership_periods",
]);

const KNOWN_EMPLOYMENT_KEYS = new Set([
  "company",
  "name",
  "employer",
  "org",
  "organization",
  "org_name",
  "company_name",
  "workplace",
  "work",
  "position",
  "title",
  "post",
  "job",
  "occupation",
  "wish",
  "desired_position",
  "desired_title",
  "desired",
  "from",
  "to",
  "date_from",
  "dateFrom",
  "date_to",
  "dateTo",
  "start",
  "end",
  "periodFrom",
  "period_from",
  "periodTo",
  "period_to",
]);

const KNOWN_FINANCE_KEYS = new Set([
  "amount",
  "sum",
  "income",
  "salary",
  "value",
  "currency",
  "curr",
  "year",
  "kind",
  "type",
  "employer",
  "company",
  "org",
  "raw",
  "text",
  "description",
]);

export type CollectPersonResult = {
  person: PersonDraft | null;
  reportQuery?: string;
  warnings: ParseWarning[];
  /** Relationships when no PersonDraft (connections-only embed). */
  orphanRelationships?: Relationship[];
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
  const bankRelations: BankRelation[] = [];
  const vehicles: Vehicle[] = [];
  const employments: Employment[] = [];
  const financialFacts: FinancialFact[] = [];
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

  // --- banks → BankRelation (v0.3 / PRD G1) ---
  for (const item of asArray(data.banks)) {
    if (!isRecord(item)) continue;
    const bankName =
      asString(item.name) ??
      asString(item.bank) ??
      asString(item.bank_name) ??
      asString(item.bankName) ??
      asString(item.title);
    if (!bankName) {
      warnings.push({
        code: "EMPTY_SECTION",
        message: "Bank entry missing name",
        section: "banks",
        severity: "warn",
      });
      continue;
    }
    const accountHint =
      asString(item.accountHint) ??
      asString(item.account_hint) ??
      asString(item.account) ??
      asString(item.account_number) ??
      asString(item.account_no);
    const role = asString(item.role);
    const bik = asString(item.bik) ?? asString(item.bic);
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (!KNOWN_BANK_KEYS.has(k)) extras[k] = v;
    }
    const bank: BankRelation = {
      bankName,
      provenance: [
        makeProvenance({
          ...provBase,
          section: "banks",
          originalKey: "name",
          originalValue: bankName,
        }),
      ],
    };
    if (accountHint) bank.accountHint = accountHint;
    if (role) bank.role = role;
    if (bik) bank.bik = bik;
    if (Object.keys(extras).length > 0) bank.extras = extras;
    bankRelations.push(bank);
  }

  // --- vehicles / autoregs → Vehicle (v0.3; no photo pipeline) ---
  const collectVehicleItems = (items: unknown[], section: string) => {
    for (const item of items) {
      if (!isRecord(item)) continue;
      const brand =
        asString(item.brand) ??
        asString(item.mark) ??
        asString(item.make) ??
        asString(item.vendor);
      const model = asString(item.model);
      const plate =
        asString(item.plate) ??
        asString(item.reg_num) ??
        asString(item.regNum) ??
        asString(item.regnum) ??
        asString(item.reg_number) ??
        asString(item.regNumber) ??
        asString(item.gosnomer) ??
        asString(item.gos_nomer) ??
        asString(item.license_plate) ??
        asString(item.licensePlate) ??
        asString(item.number);
      const vin =
        asString(item.vin) ??
        asString(item.body_number) ??
        asString(item.bodyNumber);
      if (!brand && !model && !plate && !vin) {
        warnings.push({
          code: "EMPTY_SECTION",
          message: "Vehicle entry missing plate, vin, brand, or model",
          section,
          severity: "warn",
        });
        continue;
      }
      const yearRaw = asFiniteNumber(
        item.year ?? item.year_issue ?? item.yearIssue,
      );
      const year =
        yearRaw != null &&
        Number.isInteger(yearRaw) &&
        yearRaw >= 1000 &&
        yearRaw <= 2100
          ? yearRaw
          : undefined;
      const powerHp = asFiniteNumber(
        item.powerHp ?? item.power_hp ?? item.power ?? item.hp,
      );
      const engineVolumeCc = asFiniteNumber(
        item.engineVolumeCc ??
          item.engine_volume ??
          item.engineVolume ??
          item.volume ??
          item.cc,
      );
      const category = asString(item.category) ?? asString(item.category_ts);
      const extras: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (!KNOWN_VEHICLE_KEYS.has(k)) extras[k] = v;
      }
      if (yearRaw != null && year == null) extras.year = yearRaw;
      const ownershipPeriods: NonNullable<Vehicle["ownershipPeriods"]> = [];
      const listedPeriods = asArray(
        item.ownershipPeriods ?? item.ownership_periods,
      );
      for (const period of listedPeriods) {
        if (!isRecord(period)) continue;
        const mapped = {
          ...(asString(period.from) || asString(period.date_from)
            ? { from: asString(period.from) ?? asString(period.date_from) }
            : {}),
          ...(asString(period.to) || asString(period.date_to)
            ? { to: asString(period.to) ?? asString(period.date_to) }
            : {}),
          ...(asString(period.ownerName) ||
          asString(period.owner_name) ||
          asString(period.owner)
            ? {
                ownerName:
                  asString(period.ownerName) ??
                  asString(period.owner_name) ??
                  asString(period.owner),
              }
            : {}),
          ...(asString(period.operationCode) ||
          asString(period.operation_code) ||
          asString(period.operation)
            ? {
                operationCode:
                  asString(period.operationCode) ??
                  asString(period.operation_code) ??
                  asString(period.operation),
              }
            : {}),
        };
        if (Object.keys(mapped).length > 0) ownershipPeriods.push(mapped);
      }
      const from =
        asString(item.from) ??
        asString(item.date_from) ??
        asString(item.dateFrom);
      const to =
        asString(item.to) ?? asString(item.date_to) ?? asString(item.dateTo);
      const ownerName =
        asString(item.ownerName) ??
        asString(item.owner_name) ??
        asString(item.owner);
      const operationCode =
        asString(item.operationCode) ??
        asString(item.operation_code) ??
        asString(item.operation);
      if (from || to || ownerName || operationCode) {
        ownershipPeriods.push({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(ownerName ? { ownerName } : {}),
          ...(operationCode ? { operationCode } : {}),
        });
      }
      const vehicle: Vehicle = {
        provenance: [
          makeProvenance({
            ...provBase,
            section,
            originalKey: plate
              ? "plate"
              : vin
                ? "vin"
                : brand
                  ? "brand"
                  : "model",
            originalValue: plate ?? vin ?? brand ?? model ?? "",
          }),
        ],
      };
      if (brand) vehicle.brand = brand;
      if (model) vehicle.model = model;
      if (year != null) vehicle.year = year;
      if (plate) vehicle.plate = plate;
      if (vin) vehicle.vin = vin;
      if (powerHp != null && powerHp > 0) vehicle.powerHp = powerHp;
      if (engineVolumeCc != null && engineVolumeCc > 0) {
        vehicle.engineVolumeCc = engineVolumeCc;
      }
      if (category) vehicle.category = category;
      if (ownershipPeriods.length > 0) vehicle.ownershipPeriods = ownershipPeriods;
      if (Object.keys(extras).length > 0) vehicle.extras = extras;
      vehicles.push(vehicle);
    }
  };
  collectVehicleItems(asArray(data.vehicles), "vehicles");
  collectVehicleItems(asArray(data.autoregs), "autoregs");

  // --- work / companies → Employment (v0.3) ---
  const collectEmploymentItems = (items: unknown[], section: string) => {
    for (const item of items) {
      if (!isRecord(item)) continue;
      const employer =
        asString(item.employer) ??
        asString(item.company) ??
        asString(item.company_name) ??
        asString(item.organization) ??
        asString(item.org_name) ??
        asString(item.org) ??
        asString(item.workplace) ??
        asString(item.work) ??
        asString(item.name);
      const position =
        asString(item.position) ??
        asString(item.title) ??
        asString(item.post) ??
        asString(item.job) ??
        asString(item.occupation);
      if (!employer && !position) {
        warnings.push({
          code: "EMPTY_SECTION",
          message: "Employment entry missing employer or position",
          section,
          severity: "warn",
        });
        continue;
      }
      const wish =
        asString(item.wish) ??
        asString(item.desired_position) ??
        asString(item.desired_title) ??
        asString(item.desired);
      const periodFrom =
        asString(item.periodFrom) ??
        asString(item.period_from) ??
        asString(item.from) ??
        asString(item.date_from) ??
        asString(item.dateFrom) ??
        asString(item.start);
      const periodTo =
        asString(item.periodTo) ??
        asString(item.period_to) ??
        asString(item.to) ??
        asString(item.date_to) ??
        asString(item.dateTo) ??
        asString(item.end);
      const extras: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (!KNOWN_EMPLOYMENT_KEYS.has(k)) extras[k] = v;
      }
      const employment: Employment = {
        provenance: [
          makeProvenance({
            ...provBase,
            section,
            originalKey: employer ? "employer" : "position",
            originalValue: employer ?? position ?? "",
          }),
        ],
      };
      if (employer) employment.employer = employer;
      if (position) employment.position = position;
      if (wish) employment.wish = wish;
      if (periodFrom) employment.periodFrom = periodFrom;
      if (periodTo) employment.periodTo = periodTo;
      if (Object.keys(extras).length > 0) employment.extras = extras;
      employments.push(employment);
    }
  };
  collectEmploymentItems(asArray(data.work), "work");
  collectEmploymentItems(asArray(data.companies), "companies");

  // --- finance → FinancialFact (v0.3) ---
  for (const item of asArray(data.finance)) {
    if (!isRecord(item)) continue;
    const amount =
      asString(item.amount) ??
      asString(item.sum) ??
      asString(item.income) ??
      asString(item.salary) ??
      asString(item.value);
    const raw =
      asString(item.raw) ?? asString(item.text) ?? asString(item.description);
    const employer =
      asString(item.employer) ??
      asString(item.company) ??
      asString(item.org);
    if (!amount && !raw && !employer) {
      warnings.push({
        code: "EMPTY_SECTION",
        message: "Finance entry missing amount, raw, or employer",
        section: "finance",
        severity: "warn",
      });
      continue;
    }
    const currency = asString(item.currency) ?? asString(item.curr);
    const year = asString(item.year);
    const kind = asString(item.kind) ?? asString(item.type);
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (!KNOWN_FINANCE_KEYS.has(k)) extras[k] = v;
    }
    const fact: FinancialFact = {
      provenance: [
        makeProvenance({
          ...provBase,
          section: "finance",
          originalKey: amount ? "amount" : raw ? "raw" : "employer",
          originalValue: amount ?? raw ?? employer ?? "",
        }),
      ],
    };
    if (amount) fact.amount = amount;
    if (currency) fact.currency = currency;
    if (year) fact.year = year;
    if (kind) fact.kind = kind;
    if (employer) fact.employer = employer;
    if (raw) fact.raw = raw;
    if (Object.keys(extras).length > 0) fact.extras = extras;
    financialFacts.push(fact);
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
      type: mapRelationType(relation),
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

  // Identity signal required for PersonDraft (fio / phone / email / document).
  // Connections-only embed → no shell person (Issue 7).
  const hasIdentity =
    Boolean(canonicalName) ||
    contactPoints.some((c) => c.kind === "phone" || c.kind === "email") ||
    documents.length > 0;

  if (!hasIdentity) {
    if (relationships.length > 0) {
      warnings.push({
        code: "NO_PRIMARY_IDENTITY",
        message:
          "Embed has connections/family but no profile identity (fio/phone/email/document); no PersonDraft emitted",
        severity: "warn",
      });
    }
    return {
      person: null,
      reportQuery: query,
      warnings,
      // surface relationships at top-level via caller when no person
      orphanRelationships: relationships,
    };
  }

  const person: PersonDraft = {
    nameVariants,
    contactPoints,
    documents,
    addresses,
    relationships,
    riskScores: [],
    incidents: [],
    bankRelations,
    vehicles,
    employments,
    financialFacts,
  };
  if (canonicalName) person.canonicalName = canonicalName;
  if (dateOfBirth) person.dateOfBirth = dateOfBirth;
  if (placeOfBirth) person.placeOfBirth = placeOfBirth;
  if (Object.keys(profileExtras).length > 0) {
    person.extras = { profile: profileExtras };
  }

  return { person, reportQuery: query, warnings };
}

/** Map Russian/raw relation label → Relationship.type (Issue 10). */
function mapRelationType(
  relation: string,
): Relationship["type"] {
  const r = relation.trim().toLowerCase().replace(/ё/g, "е");
  const familyHints = [
    "семья",
    "семей",
    "ребенок",
    "ребёнок",
    "сын",
    "дочь",
    "доч",
    "отец",
    "мать",
    "мама",
    "папа",
    "супруг",
    "супруга",
    "жена",
    "муж",
    "брат",
    "сестра",
    "бабуш",
    "дедуш",
    "внук",
    "внуч",
    "family",
    "child",
    "spouse",
    "parent",
  ];
  if (familyHints.some((h) => r.includes(h))) return "family";
  if (r.includes("коллег") || r.includes("colleague") || r.includes("работ")) {
    return "colleague";
  }
  if (r.includes("сосед") || r.includes("neighbor")) return "neighbor";
  if (r.includes("возможн") || r.includes("possible")) return "possible";
  return "other";
}
