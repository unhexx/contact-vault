import type {
  Address,
  ContactPoint,
  IdentityDocument,
  Incident,
  NameVariant,
  PersonDraft,
  Relationship,
  RiskScore,
} from "@contact-vault/domain";
import {
  normalizeDocumentNumber,
  normalizeEmail,
} from "@contact-vault/domain";
import {
  classifyRelatedPerson,
  isLikelySamePerson,
  normalizeDate,
  normalizePhone,
  parseFio,
} from "../normalize/index.js";
import { makeProvenance } from "../provenance.js";
import type { ParseWarning } from "../types.js";
import {
  parseAddressesBlob,
  parseIncomesBlock,
  type LeanFinancialFact,
} from "./extractBlocks.js";
import type { ExtractedScoring } from "./extractScoring.js";
import { resolveKeyAlias, type InlineDomainTarget } from "./keyAliases.js";
import { parseInlineKV } from "./parseInlineKV.js";
import type { InlineRawRecord } from "./splitRecords.js";

export type MapContext = {
  reportId: string;
  reportQuery?: string;
  extractedAt: string;
};

type Accumulator = {
  phones: ContactPoint[];
  emails: ContactPoint[];
  socials: ContactPoint[];
  documents: IdentityDocument[];
  addresses: Address[];
  relationships: Relationship[];
  nameVariants: NameVariant[];
  riskScores: RiskScore[];
  incidents: Incident[];
  canonicalName?: NameVariant;
  dateOfBirth?: string;
  placeOfBirth?: string;
  extras: Record<string, unknown>;
  passportDraft: {
    number?: string;
    issuedAt?: string;
    issuedBy?: string;
    departmentCode?: string;
  };
  /** Pending relation type for related_person key in same record */
  pendingRelationLabel?: string;
};

function emptyAcc(): Accumulator {
  return {
    phones: [],
    emails: [],
    socials: [],
    documents: [],
    addresses: [],
    relationships: [],
    nameVariants: [],
    riskScores: [],
    incidents: [],
    extras: {},
    passportDraft: {},
  };
}

function flushPassport(
  acc: Accumulator,
  ctx: MapContext,
  sourceName: string,
  section?: string,
): void {
  const n = acc.passportDraft.number;
  if (!n) {
    acc.passportDraft = {};
    return;
  }
  const doc: IdentityDocument = {
    type: "passport_ru",
    number: n,
    provenance: [
      makeProvenance({
        reportId: ctx.reportId,
        reportQuery: ctx.reportQuery,
        sourceName,
        section,
        originalKey: "Паспорт",
        originalValue: n,
        extractedAt: ctx.extractedAt,
      }),
    ],
  };
  if (acc.passportDraft.issuedAt) doc.issuedAt = acc.passportDraft.issuedAt;
  if (acc.passportDraft.issuedBy) doc.issuedBy = acc.passportDraft.issuedBy;
  if (acc.passportDraft.departmentCode) {
    doc.departmentCode = acc.passportDraft.departmentCode;
  }
  addDocument(acc, doc);
  acc.passportDraft = {};
}

function addDocument(acc: Accumulator, doc: IdentityDocument): void {
  const numberNorm = normalizeDocumentNumber(doc.type, doc.number);
  const existing = acc.documents.find(
    (d) =>
      d.type === doc.type &&
      normalizeDocumentNumber(d.type, d.number) === numberNorm,
  );
  if (existing) {
    existing.provenance.push(...doc.provenance);
    if (!existing.issuedAt && doc.issuedAt) existing.issuedAt = doc.issuedAt;
    if (!existing.issuedBy && doc.issuedBy) existing.issuedBy = doc.issuedBy;
    if (!existing.departmentCode && doc.departmentCode) {
      existing.departmentCode = doc.departmentCode;
    }
    return;
  }
  acc.documents.push(doc);
}

function addPhone(
  acc: Accumulator,
  raw: string,
  ctx: MapContext,
  sourceName: string,
  originalKey: string,
  warnings: ParseWarning[],
  section?: string,
): void {
  const n = normalizePhone(raw);
  const prov = makeProvenance({
    reportId: ctx.reportId,
    reportQuery: ctx.reportQuery,
    sourceName,
    section,
    originalKey,
    originalValue: raw,
    extractedAt: ctx.extractedAt,
    ...(n.ok ? {} : { confidence: 0.5 }),
  });

  if (n.ok) {
    const existing = acc.phones.find(
      (p) => p.kind === "phone" && p.e164 === n.e164,
    );
    if (existing && existing.kind === "phone") {
      existing.provenance.push(prov);
      if (!existing.raw) existing.raw = n.raw;
      return;
    }
    acc.phones.push({
      kind: "phone",
      e164: n.e164,
      raw: n.raw,
      provenance: [prov],
    });
    return;
  }

  const existingRaw = acc.phones.find(
    (p) => p.kind === "phone" && !p.e164 && p.raw === n.raw,
  );
  if (existingRaw && existingRaw.kind === "phone") {
    existingRaw.provenance.push(prov);
  } else {
    acc.phones.push({
      kind: "phone",
      raw: n.raw,
      provenance: [prov],
    });
  }
  warnings.push({
    code: "PHONE_UNNORMALIZED",
    message: `Could not normalize phone to E.164: ${raw}`,
    section,
    key: originalKey,
    severity: "warn",
  });
}

function addEmail(
  acc: Accumulator,
  value: string,
  ctx: MapContext,
  sourceName: string,
  originalKey: string,
  section?: string,
): void {
  const norm = normalizeEmail(value);
  const existing = acc.emails.find(
    (e) => e.kind === "email" && normalizeEmail(e.value) === norm,
  );
  const prov = makeProvenance({
    reportId: ctx.reportId,
    reportQuery: ctx.reportQuery,
    sourceName,
    section,
    originalKey,
    originalValue: value,
    extractedAt: ctx.extractedAt,
  });
  if (existing && existing.kind === "email") {
    existing.provenance.push(prov);
    return;
  }
  acc.emails.push({
    kind: "email",
    value,
    provenance: [prov],
  });
}

function addName(
  acc: Accumulator,
  fio: string,
  ctx: MapContext,
  sourceName: string,
  originalKey: string,
  dobHint?: string,
  section?: string,
): void {
  const parsed = parseFio(fio);
  const nv: NameVariant = {
    full: parsed.full,
    ...(parsed.last ? { last: parsed.last } : {}),
    ...(parsed.first ? { first: parsed.first } : {}),
    ...(parsed.middle ? { middle: parsed.middle } : {}),
    ...(dobHint ? { dobHint } : {}),
    provenance: [
      makeProvenance({
        reportId: ctx.reportId,
        reportQuery: ctx.reportQuery,
        sourceName,
        section,
        originalKey,
        originalValue: fio,
        extractedAt: ctx.extractedAt,
      }),
    ],
  };
  if (!acc.canonicalName) {
    acc.canonicalName = nv;
  }
  acc.nameVariants.push(nv);
}

function pushExtras(
  acc: Accumulator,
  key: string,
  value: string,
  bag: string,
): void {
  const arr = (acc.extras[bag] as Array<Record<string, string>> | undefined) ?? [];
  arr.push({ key, value });
  acc.extras[bag] = arr;
}

function applyPair(
  acc: Accumulator,
  key: string,
  value: string,
  ctx: MapContext,
  sourceName: string,
  warnings: ParseWarning[],
  /** When true, related FIO becomes Relationship not primary facts */
  asRelatedOnly: boolean,
  section?: string,
): void {
  const target: InlineDomainTarget = resolveKeyAlias(key);
  const v = value.trim();
  if (!v && target !== "unknown") return;

  switch (target) {
    case "phone": {
      if (asRelatedOnly) return;
      addPhone(acc, v, ctx, sourceName, key, warnings, section);
      break;
    }
    case "email": {
      if (asRelatedOnly) return;
      addEmail(acc, v, ctx, sourceName, key, section);
      break;
    }
    case "fio": {
      if (asRelatedOnly) return;
      addName(acc, v, ctx, sourceName, key, undefined, section);
      break;
    }
    case "dob": {
      if (asRelatedOnly) return;
      const d = normalizeDate(v) ?? v;
      if (!acc.dateOfBirth) acc.dateOfBirth = d;
      break;
    }
    case "place_of_birth": {
      if (asRelatedOnly) return;
      if (!acc.placeOfBirth) acc.placeOfBirth = v;
      break;
    }
    case "passport": {
      if (asRelatedOnly) return;
      if (
        acc.passportDraft.number &&
        acc.passportDraft.number !== v
      ) {
        flushPassport(acc, ctx, sourceName, section);
      }
      acc.passportDraft.number = v;
      break;
    }
    case "passport_issued_at": {
      if (asRelatedOnly) return;
      acc.passportDraft.issuedAt = normalizeDate(v) ?? v;
      break;
    }
    case "passport_issued_by": {
      if (asRelatedOnly) return;
      acc.passportDraft.issuedBy = v;
      break;
    }
    case "passport_department_code": {
      if (asRelatedOnly) return;
      acc.passportDraft.departmentCode = v;
      break;
    }
    case "snils": {
      if (asRelatedOnly) return;
      addDocument(acc, {
        type: "snils",
        number: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "inn": {
      if (asRelatedOnly) return;
      addDocument(acc, {
        type: "inn",
        number: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "oms": {
      if (asRelatedOnly) return;
      addDocument(acc, {
        type: "oms",
        number: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "military": {
      if (asRelatedOnly) return;
      addDocument(acc, {
        type: "military",
        number: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "driving_license": {
      if (asRelatedOnly) return;
      addDocument(acc, {
        type: "driving_license",
        number: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "address": {
      if (asRelatedOnly) return;
      acc.addresses.push({
        raw: v,
        category: /регистр/i.test(key) ? "registration" : "other",
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "related_person": {
      // Explicit related FIO key → Relationship
      const dobMatch = v.match(
        /^(.+?)\s+(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})$/,
      );
      const fio = dobMatch ? dobMatch[1]!.trim() : v.trim();
      const dob = dobMatch
        ? (normalizeDate(dobMatch[2]!) ?? dobMatch[2]!)
        : undefined;
      acc.relationships.push({
        type: "family",
        relationLabel: acc.pendingRelationLabel ?? "related",
        relatedPersonHint: {
          fio,
          ...(dob ? { dob } : {}),
        },
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      acc.pendingRelationLabel = undefined;
      break;
    }
    case "relation_type": {
      acc.pendingRelationLabel = v;
      // If last relationship has generic label, upgrade it
      const last = acc.relationships[acc.relationships.length - 1];
      if (last && (!last.relationLabel || last.relationLabel === "related")) {
        last.relationLabel = v;
      }
      break;
    }
    case "criminal_article": {
      if (asRelatedOnly) return;
      acc.incidents.push({
        severity: "high",
        title: `Статья ${v}`,
        articleCode: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "criminal_case": {
      if (asRelatedOnly) return;
      const last = acc.incidents[acc.incidents.length - 1];
      if (last) {
        last.caseNumber = v;
      } else {
        acc.incidents.push({
          severity: "high",
          caseNumber: v,
          provenance: [
            makeProvenance({
              reportId: ctx.reportId,
              reportQuery: ctx.reportQuery,
              sourceName,
              section,
              originalKey: key,
              originalValue: v,
              extractedAt: ctx.extractedAt,
            }),
          ],
        });
      }
      break;
    }
    case "criminal_sentence_date": {
      if (asRelatedOnly) return;
      const last = acc.incidents[acc.incidents.length - 1];
      if (last) {
        last.sentenceDate = normalizeDate(v) ?? v;
      }
      break;
    }
    case "criminal_decision": {
      if (asRelatedOnly) return;
      const last = acc.incidents[acc.incidents.length - 1];
      if (last) {
        last.decision = v;
      }
      break;
    }
    case "employer":
    case "position":
    case "income": {
      if (asRelatedOnly) return;
      pushExtras(acc, key, v, "employments");
      break;
    }
    case "vehicle_plate":
    case "vehicle_vin":
    case "vehicle_model": {
      if (asRelatedOnly) return;
      pushExtras(acc, key, v, "vehicles");
      break;
    }
    case "bank_account":
    case "card_number": {
      if (asRelatedOnly) return;
      pushExtras(acc, key, v, "financialFacts");
      break;
    }
    case "citizenship": {
      if (asRelatedOnly) return;
      acc.extras[`citizenship`] = v;
      break;
    }
    case "telegram": {
      if (asRelatedOnly) return;
      acc.socials.push({
        kind: "messenger",
        network: "telegram",
        identifier: v,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section,
            originalKey: key,
            originalValue: v,
            extractedAt: ctx.extractedAt,
          }),
        ],
      });
      break;
    }
    case "unknown":
    default: {
      if (asRelatedOnly) return;
      acc.extras[`${sourceName}::${key}`] = v;
      warnings.push({
        code: "UNKNOWN_KEY",
        message: `Unknown key "${key}" stored in extras`,
        section: sourceName,
        key,
        severity: "info",
      });
      break;
    }
  }
}

function pairValue(
  pairs: Array<{ key: string; value: string }>,
  target: InlineDomainTarget,
): string | undefined {
  for (const p of pairs) {
    if (resolveKeyAlias(p.key) === target && p.value.trim()) {
      return p.value.trim();
    }
  }
  return undefined;
}

function seedReportQueryFromPairs(
  records: Array<{ pairs: Array<{ key: string; value: string }> }>,
  fallback?: string,
): string | undefined {
  if (fallback) return fallback;
  for (const rec of records) {
    for (const p of rec.pairs) {
      if (resolveKeyAlias(p.key) !== "phone") continue;
      const n = normalizePhone(p.value);
      if (n.ok) return n.e164;
      if (n.raw.trim()) return n.raw.trim();
    }
  }
  return undefined;
}

/**
 * Map inline records + scoring/blocks → PersonDraft (KD17, KD38, KD39).
 */
export function mapInlineToDomain(
  records: InlineRawRecord[],
  scoring: ExtractedScoring,
  blocks: {
    incomesRaw?: string;
    addressesRaw?: string;
  },
  ctx: MapContext,
): {
  person: PersonDraft | null;
  relationships: Relationship[];
  reportQuery?: string;
  warnings: ParseWarning[];
} {
  const warnings: ParseWarning[] = [...scoring.warnings];
  const acc = emptyAcc();

  // Parse each record into KV pairs (prepend Имя : so leading FIO is keyed)
  const parsedRecords = records.map((r) => {
    const text = `Имя : ${r.body}`;
    const pairs = parseInlineKV(text);
    return { ...r, pairs };
  });

  const reportQuery = seedReportQueryFromPairs(parsedRecords, ctx.reportQuery);
  const mapCtx: MapContext = { ...ctx, reportQuery };

  let primaryFio: string | undefined;
  let primaryDob: string | undefined;

  for (const rec of parsedRecords) {
    const sourceName = rec.sourceLabel;
    const fio = pairValue(rec.pairs, "fio");
    const dobRaw = pairValue(rec.pairs, "dob");
    const dob = dobRaw ? (normalizeDate(dobRaw) ?? dobRaw) : undefined;
    const relationType = pairValue(rec.pairs, "relation_type");

    // Seed primary from first FIO
    if (!primaryFio && fio) {
      primaryFio = fio;
      primaryDob = dob;
    }

    // KD17: later records with different person → Relationship only
    if (primaryFio && fio) {
      const verdict = classifyRelatedPerson(
        primaryFio,
        primaryDob,
        fio,
        dob,
      );
      if (verdict.kind === "related" || verdict.kind === "ambiguous") {
        const relPhones: string[] = [];
        for (const p of rec.pairs) {
          if (resolveKeyAlias(p.key) === "phone" && p.value.trim()) {
            relPhones.push(p.value.trim());
          }
        }
        acc.relationships.push({
          type: "family",
          relationLabel: relationType ?? "related",
          relatedPersonHint: {
            fio,
            ...(dob ? { dob } : {}),
            ...(relPhones.length ? { phones: relPhones } : {}),
          },
          provenance: [
            makeProvenance({
              reportId: mapCtx.reportId,
              reportQuery: mapCtx.reportQuery,
              sourceName,
              originalKey: "Имя",
              originalValue: fio,
              extractedAt: mapCtx.extractedAt,
            }),
          ],
        });
        if (verdict.kind === "ambiguous") {
          warnings.push({
            code: "AMBIGUOUS_RECORD",
            message: `Record "${fio}" treated as related (${verdict.reason})`,
            key: "Имя",
            severity: "warn",
          });
        }
        // Do not merge related person's documents into primary
        continue;
      }

      // same-person: prefer longer FIO
      if (
        isLikelySamePerson(fio, primaryFio) &&
        fio.trim().length > primaryFio.trim().length
      ) {
        primaryFio = fio;
      }
    }

    // Apply pairs to primary
    if (relationType) acc.pendingRelationLabel = relationType;
    for (const p of rec.pairs) {
      applyPair(
        acc,
        p.key,
        p.value,
        mapCtx,
        sourceName,
        warnings,
        false,
      );
    }
    flushPassport(acc, mapCtx, sourceName);

    if (!primaryDob && acc.dateOfBirth) primaryDob = acc.dateOfBirth;
    if (!primaryFio && acc.canonicalName) primaryFio = acc.canonicalName.full;
  }

  // Attach scoring → RiskScore + Incidents on draft
  if (scoring.riskScore) {
    const rs: RiskScore = {
      overall: scoring.riskScore.overall,
      ...(scoring.riskScore.label
        ? { label: scoring.riskScore.label }
        : {}),
      categories: scoring.riskScore.categories,
      articles: scoring.riskScore.articles,
      provenance: [
        makeProvenance({
          reportId: mapCtx.reportId,
          reportQuery: mapCtx.reportQuery,
          sourceName: "Скоринг",
          section: "Результаты скоринга",
          extractedAt: mapCtx.extractedAt,
        }),
      ],
    };
    acc.riskScores.push(rs);
  }

  for (const inc of scoring.incidents) {
    acc.incidents.push({
      severity: inc.severity,
      ...(inc.title ? { title: inc.title } : {}),
      ...(inc.articleCode ? { articleCode: inc.articleCode } : {}),
      ...(inc.body ? { body: inc.body } : {}),
      provenance: [
        makeProvenance({
          reportId: mapCtx.reportId,
          reportQuery: mapCtx.reportQuery,
          sourceName: "Скоринг",
          section: "Результаты скоринга",
          extractedAt: mapCtx.extractedAt,
          ...(inc.articleCode
            ? {
                originalKey: "Статья",
                originalValue: inc.articleCode,
              }
            : {}),
        }),
      ],
    });
  }

  // Incomes → extras.financialFacts
  if (blocks.incomesRaw) {
    const facts: LeanFinancialFact[] = parseIncomesBlock(blocks.incomesRaw);
    const existing =
      (acc.extras.financialFacts as Array<Record<string, unknown>>) ?? [];
    for (const f of facts) {
      existing.push({
        ...f,
        provenance: [
          makeProvenance({
            reportId: mapCtx.reportId,
            reportQuery: mapCtx.reportQuery,
            sourceName: "Доходы",
            section: "====Доходы====",
            originalValue: f.raw,
            extractedAt: mapCtx.extractedAt,
          }),
        ],
      });
    }
    if (existing.length) acc.extras.financialFacts = existing;
  }

  // Addresses block
  if (blocks.addressesRaw) {
    const { addresses, unsplit } = parseAddressesBlob(blocks.addressesRaw);
    if (unsplit) {
      warnings.push({
        code: "ADDRESS_BLOB_UNSPLIT",
        message: "Addresses block kept as single raw blob",
        section: "====Адреса====",
        severity: "warn",
      });
    }
    for (const raw of addresses) {
      acc.addresses.push({
        raw,
        category: "other",
        provenance: [
          makeProvenance({
            reportId: mapCtx.reportId,
            reportQuery: mapCtx.reportQuery,
            sourceName: "Адреса",
            section: "====Адреса====",
            originalValue: raw,
            extractedAt: mapCtx.extractedAt,
            ...(unsplit ? { confidence: 0.5 } : {}),
          }),
        ],
      });
    }
  }

  const contactPoints: ContactPoint[] = [
    ...acc.phones,
    ...acc.emails,
    ...acc.socials,
  ];

  const hasIdentity =
    Boolean(acc.canonicalName) ||
    acc.phones.length > 0 ||
    acc.emails.length > 0 ||
    acc.documents.length > 0;

  // Scoring only, no person (KD30)
  if (!hasIdentity) {
    if (scoring.riskScore || scoring.incidents.length > 0) {
      warnings.push({
        code: "SCORING_ONLY_NO_PERSON",
        message:
          "Scoring header present but no person identity (Имя / phone / email / doc)",
        severity: "error",
      });
    }
    return {
      person: null,
      relationships: [...acc.relationships],
      reportQuery,
      warnings,
    };
  }

  const person: PersonDraft = {
    nameVariants: acc.nameVariants,
    contactPoints,
    documents: acc.documents,
    addresses: acc.addresses,
    relationships: acc.relationships, // KD38 authority
    riskScores: acc.riskScores,
    incidents: acc.incidents,
  };
  if (acc.canonicalName) person.canonicalName = acc.canonicalName;
  if (acc.dateOfBirth) person.dateOfBirth = acc.dateOfBirth;
  if (acc.placeOfBirth) person.placeOfBirth = acc.placeOfBirth;
  if (Object.keys(acc.extras).length > 0) person.extras = acc.extras;

  return {
    person,
    relationships: [...acc.relationships],
    reportQuery,
    warnings,
  };
}
