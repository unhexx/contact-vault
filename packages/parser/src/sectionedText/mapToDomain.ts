import type {
  Address,
  ContactPoint,
  IdentityDocument,
  NameVariant,
  PersonDraft,
  Relationship,
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
import { resolveKeyAlias } from "./keyAliases.js";
import {
  parseRecords,
  splitMultiValues,
  type TextRecord,
} from "./parseRecord.js";
import type { TextSection } from "./splitSections.js";

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
  canonicalName?: NameVariant;
  dateOfBirth?: string;
  placeOfBirth?: string;
  extras: Record<string, unknown>;
  /** Pending passport fields until number seen / flushed */
  passportDraft: {
    number?: string;
    issuedAt?: string;
    issuedBy?: string;
    departmentCode?: string;
  };
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
    extras: {},
    passportDraft: {},
  };
}

function sourceNameFromTitle(title: string): string {
  // Strip trailing year: "Клиенты T2.ru 2024" → "Клиенты T2.ru"
  return title.replace(/\s+\d{4}\s*$/, "").trim() || title;
}

function flushPassport(
  acc: Accumulator,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
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
        section: sectionTitle,
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

function addPhone(
  acc: Accumulator,
  raw: string,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
  originalKey: string,
  warnings: ParseWarning[],
): void {
  const n = normalizePhone(raw);
  const prov = makeProvenance({
    reportId: ctx.reportId,
    reportQuery: ctx.reportQuery,
    sourceName,
    section: sectionTitle,
    originalKey,
    originalValue: raw,
    extractedAt: ctx.extractedAt,
    ...(n.ok ? {} : { confidence: 0.5 }),
  });

  if (n.ok) {
    // Dedupe by e164 — merge provenance (shared post-processing)
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

  // Unnormalized: dedupe by raw string
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
    section: sectionTitle,
    key: originalKey,
    severity: "warn",
  });
}

function addEmail(
  acc: Accumulator,
  value: string,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
  originalKey: string,
  confidence: number,
): void {
  const norm = normalizeEmail(value);
  const existing = acc.emails.find(
    (e) => e.kind === "email" && normalizeEmail(e.value) === norm,
  );
  const prov = makeProvenance({
    reportId: ctx.reportId,
    reportQuery: ctx.reportQuery,
    sourceName,
    section: sectionTitle,
    originalKey,
    originalValue: value,
    extractedAt: ctx.extractedAt,
    confidence,
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

function addDocument(
  acc: Accumulator,
  doc: IdentityDocument,
): void {
  const numberNorm = normalizeDocumentNumber(doc.type, doc.number);
  const existing = acc.documents.find(
    (d) =>
      d.type === doc.type &&
      normalizeDocumentNumber(d.type, d.number) === numberNorm,
  );
  if (existing) {
    existing.provenance.push(...doc.provenance);
    // Prefer longer / more complete metadata
    if (!existing.issuedAt && doc.issuedAt) existing.issuedAt = doc.issuedAt;
    if (!existing.issuedBy && doc.issuedBy) existing.issuedBy = doc.issuedBy;
    if (!existing.departmentCode && doc.departmentCode) {
      existing.departmentCode = doc.departmentCode;
    }
    return;
  }
  acc.documents.push(doc);
}

/**
 * Pre-scan sections for the first normalizable phone → reportQuery seed.
 * Ensures provenance.reportQuery is set before any makeProvenance call (Issue 1).
 */
export function seedReportQueryFromSections(
  sections: TextSection[],
  fallback?: string,
): string | undefined {
  if (fallback) return fallback;
  for (const section of sections) {
    const records = parseRecords(section.body);
    for (const rec of records) {
      for (const p of rec.pairs) {
        if (resolveKeyAlias(p.key) !== "phone") continue;
        for (const part of splitMultiValues(p.value, p.key)) {
          const n = normalizePhone(part);
          if (n.ok) return n.e164;
          if (n.raw.trim()) return n.raw.trim();
        }
      }
    }
  }
  return undefined;
}

function addName(
  acc: Accumulator,
  fio: string,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
  originalKey: string,
  dobHint?: string,
  confidence = 1,
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
        section: sectionTitle,
        originalKey,
        originalValue: fio,
        extractedAt: ctx.extractedAt,
        confidence,
      }),
    ],
  };
  if (!acc.canonicalName) {
    acc.canonicalName = nv;
  }
  acc.nameVariants.push(nv);
}

/**
 * Apply one KV pair into accumulator.
 */
function applyPair(
  acc: Accumulator,
  key: string,
  value: string,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
  warnings: ParseWarning[],
  isSummary: boolean,
): void {
  const target = resolveKeyAlias(key);
  const conf = isSummary ? 0.85 : 1;

  switch (target) {
    case "phone": {
      for (const part of splitMultiValues(value, key)) {
        addPhone(acc, part, ctx, sectionTitle, sourceName, key, warnings);
      }
      break;
    }
    case "email": {
      for (const part of splitMultiValues(value, key)) {
        addEmail(acc, part, ctx, sectionTitle, sourceName, key, conf);
      }
      break;
    }
    case "fio": {
      addName(acc, value, ctx, sectionTitle, sourceName, key, undefined, conf);
      break;
    }
    case "personalities": {
      // «Личности» list: same-person variants → nameVariants;
      // clearly different FIO+DOB → Relationship only (KD17; Issue 4).
      for (const part of splitMultiValues(value, key)) {
        const dobMatch = part.match(
          /^(.+?)\s+(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})$/,
        );
        const fio = dobMatch ? dobMatch[1]!.trim() : part.trim();
        const dob = dobMatch
          ? (normalizeDate(dobMatch[2]!) ?? dobMatch[2]!)
          : undefined;

        const primaryFio = acc.canonicalName?.full;
        const primaryDob = acc.dateOfBirth;
        const verdict = classifyRelatedPerson(primaryFio, primaryDob, fio, dob);

        if (verdict.kind === "same" || !primaryFio) {
          addName(acc, fio, ctx, sectionTitle, sourceName, key, dob, conf);
          if (dob && !acc.dateOfBirth) acc.dateOfBirth = dob;
        } else {
          // Related or ambiguous → Relationship hint only (not NameVariant of primary)
          acc.relationships.push({
            type: "family",
            relationLabel: "related",
            relatedPersonHint: {
              fio,
              ...(dob ? { dob } : {}),
            },
            provenance: [
              makeProvenance({
                reportId: ctx.reportId,
                reportQuery: ctx.reportQuery,
                sourceName,
                section: sectionTitle,
                originalKey: key,
                originalValue: part,
                extractedAt: ctx.extractedAt,
                confidence: conf,
              }),
            ],
          });
          if (verdict.kind === "ambiguous") {
            warnings.push({
              code: "AMBIGUOUS_RECORD",
              message: `Личности entry "${fio}" classified as related (${verdict.reason})`,
              section: sectionTitle,
              key,
              severity: "warn",
            });
          }
        }
      }
      break;
    }
    case "dob": {
      const d = normalizeDate(value) ?? value;
      if (!acc.dateOfBirth) acc.dateOfBirth = d;
      break;
    }
    case "place_of_birth": {
      if (!acc.placeOfBirth) acc.placeOfBirth = value;
      break;
    }
    case "passport": {
      const parts = splitMultiValues(value, key);
      if (parts.length > 1) {
        // Summary list of multiple passports — flush each number alone
        for (const part of parts) {
          flushPassport(acc, ctx, sectionTitle, sourceName);
          acc.passportDraft.number = part;
          flushPassport(acc, ctx, sectionTitle, sourceName);
        }
      } else if (parts[0]) {
        // Single number: keep draft open so issuedAt/issuedBy in same record attach
        if (
          acc.passportDraft.number &&
          acc.passportDraft.number !== parts[0]
        ) {
          flushPassport(acc, ctx, sectionTitle, sourceName);
        }
        acc.passportDraft.number = parts[0];
      }
      break;
    }
    case "passport_issued_at": {
      acc.passportDraft.issuedAt = normalizeDate(value) ?? value;
      break;
    }
    case "passport_issued_by": {
      acc.passportDraft.issuedBy = value;
      break;
    }
    case "passport_department_code": {
      acc.passportDraft.departmentCode = value;
      break;
    }
    case "snils": {
      for (const part of splitMultiValues(value, key)) {
        addDocument(acc, {
          type: "snils",
          number: part,
          provenance: [
            makeProvenance({
              reportId: ctx.reportId,
              reportQuery: ctx.reportQuery,
              sourceName,
              section: sectionTitle,
              originalKey: key,
              originalValue: part,
              extractedAt: ctx.extractedAt,
              confidence: conf,
            }),
          ],
        });
      }
      break;
    }
    case "inn": {
      for (const part of splitMultiValues(value, key)) {
        addDocument(acc, {
          type: "inn",
          number: part,
          provenance: [
            makeProvenance({
              reportId: ctx.reportId,
              reportQuery: ctx.reportQuery,
              sourceName,
              section: sectionTitle,
              originalKey: key,
              originalValue: part,
              extractedAt: ctx.extractedAt,
              confidence: conf,
            }),
          ],
        });
      }
      break;
    }
    case "oms": {
      for (const part of splitMultiValues(value, key)) {
        addDocument(acc, {
          type: "oms",
          number: part,
          provenance: [
            makeProvenance({
              reportId: ctx.reportId,
              reportQuery: ctx.reportQuery,
              sourceName,
              section: sectionTitle,
              originalKey: key,
              originalValue: part,
              extractedAt: ctx.extractedAt,
              confidence: conf,
            }),
          ],
        });
      }
      break;
    }
    case "driving_license": {
      addDocument(acc, {
        type: "driving_license",
        number: value,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section: sectionTitle,
            originalKey: key,
            originalValue: value,
            extractedAt: ctx.extractedAt,
            confidence: conf,
          }),
        ],
      });
      break;
    }
    case "address": {
      // do not split addresses
      acc.addresses.push({
        raw: value,
        category: /регистр/i.test(key) ? "registration" : "other",
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section: sectionTitle,
            originalKey: key,
            originalValue: value,
            extractedAt: ctx.extractedAt,
            confidence: conf,
          }),
        ],
      });
      break;
    }
    case "telegram": {
      acc.socials.push({
        kind: "messenger",
        network: "telegram",
        identifier: value,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section: sectionTitle,
            originalKey: key,
            originalValue: value,
            extractedAt: ctx.extractedAt,
            confidence: conf,
          }),
        ],
      });
      break;
    }
    case "max_id": {
      acc.socials.push({
        kind: "messenger",
        network: "max",
        identifier: value,
        provenance: [
          makeProvenance({
            reportId: ctx.reportId,
            reportQuery: ctx.reportQuery,
            sourceName,
            section: sectionTitle,
            originalKey: key,
            originalValue: value,
            extractedAt: ctx.extractedAt,
            confidence: conf,
          }),
        ],
      });
      break;
    }
    case "unknown":
    default: {
      const extrasKey = `${sectionTitle}::${key}`;
      acc.extras[extrasKey] = value;
      warnings.push({
        code: "UNKNOWN_KEY",
        message: `Unknown key "${key}" stored in extras`,
        section: sectionTitle,
        key,
        severity: "info",
      });
      break;
    }
  }
}

function recordFio(rec: TextRecord): string | undefined {
  for (const p of rec.pairs) {
    if (resolveKeyAlias(p.key) === "fio" && p.value.trim()) return p.value.trim();
  }
  return undefined;
}

function recordDob(rec: TextRecord): string | undefined {
  for (const p of rec.pairs) {
    if (resolveKeyAlias(p.key) === "dob" && p.value.trim()) {
      return normalizeDate(p.value) ?? p.value.trim();
    }
  }
  return undefined;
}

function applyRecordToPrimary(
  acc: Accumulator,
  rec: TextRecord,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
  warnings: ParseWarning[],
  isSummary: boolean,
): void {
  for (const p of rec.pairs) {
    applyPair(
      acc,
      p.key,
      p.value,
      ctx,
      sectionTitle,
      sourceName,
      warnings,
      isSummary,
    );
  }
  flushPassport(acc, ctx, sectionTitle, sourceName);
}

/**
 * Map all sections → single PersonDraft; related multi-records → Relationship only (KD17).
 *
 * Pass 1: seed reportQuery from first phone so all provenance carries it (Issue 1).
 * Pass 2: map facts; same-person name variants keep documents; distinct FIO → Relationship.
 */
export function mapSectionsToDomain(
  sections: TextSection[],
  ctx: MapContext,
): {
  person: PersonDraft | null;
  relationships: Relationship[];
  reportQuery?: string;
  warnings: ParseWarning[];
} {
  const warnings: ParseWarning[] = [];
  const acc = emptyAcc();

  if (sections.length === 0) {
    warnings.push({
      code: "EMPTY_SECTION",
      message: "No === sections found",
      severity: "error",
    });
    return { person: null, relationships: [], warnings };
  }

  // Process summary first if present
  const summaryIdx = sections.findIndex((s) =>
    /общая\s+сводка/i.test(s.title),
  );
  const ordered =
    summaryIdx >= 0
      ? [sections[summaryIdx]!, ...sections.filter((_, i) => i !== summaryIdx)]
      : sections;

  // Pass 1 — reportQuery before any provenance (Issue 1)
  const reportQuery = seedReportQueryFromSections(ordered, ctx.reportQuery);
  const mapCtx: MapContext = { ...ctx, reportQuery };

  let primaryFio: string | undefined;
  let primaryDob: string | undefined;

  for (const section of ordered) {
    const isSummary = /общая\s+сводка/i.test(section.title);
    const sourceName = isSummary
      ? "Общая сводка"
      : sourceNameFromTitle(section.title);
    const records = parseRecords(section.body);

    if (records.length === 0 && section.body.trim() === "") {
      warnings.push({
        code: "EMPTY_SECTION",
        message: `Empty section: ${section.title}`,
        section: section.title,
        severity: "info",
      });
      continue;
    }

    for (const rec of records) {
      const fio = recordFio(rec);
      const dob = recordDob(rec);

      // Seed primary identity from first FIO we see
      if (!primaryFio && fio) {
        primaryFio = fio;
        primaryDob = dob ?? acc.dateOfBirth;
      }

      // KD17: classify same vs related (token-subset / last+first = same person)
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
            if (resolveKeyAlias(p.key) === "phone") {
              for (const part of splitMultiValues(p.value, p.key)) {
                relPhones.push(part);
              }
            }
          }
          acc.relationships.push({
            type: "family",
            relationLabel: "related",
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
                section: section.title,
                originalKey: "ФИО",
                originalValue: fio,
                extractedAt: mapCtx.extractedAt,
              }),
            ],
          });
          if (verdict.kind === "ambiguous") {
            warnings.push({
              code: "AMBIGUOUS_RECORD",
              message: `Record "${fio}" treated as related (${verdict.reason})`,
              section: section.title,
              key: "ФИО",
              severity: "warn",
            });
          }
          // Do not merge related person's documents into primary
          continue;
        }

        // same-person name variant: prefer longer FIO as primary label
        if (
          isLikelySamePerson(fio, primaryFio) &&
          fio.trim().length > primaryFio.trim().length
        ) {
          primaryFio = fio;
        }
      }

      applyRecordToPrimary(
        acc,
        rec,
        mapCtx,
        section.title,
        sourceName,
        warnings,
        isSummary,
      );

      // Update primary DOB / FIO after apply
      if (!primaryDob && acc.dateOfBirth) primaryDob = acc.dateOfBirth;
      if (!primaryFio && acc.canonicalName) primaryFio = acc.canonicalName.full;
      if (acc.dateOfBirth && !primaryDob) primaryDob = acc.dateOfBirth;
    }
  }

  const contactPoints: ContactPoint[] = [
    ...acc.phones,
    ...acc.emails,
    ...acc.socials,
  ];

  // Identity signal required for PersonDraft (fio / phone / email / document)
  const hasIdentity =
    Boolean(acc.canonicalName) ||
    acc.phones.length > 0 ||
    acc.emails.length > 0 ||
    acc.documents.length > 0;

  if (!hasIdentity) {
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
    relationships: acc.relationships,
    riskScores: [],
    incidents: [],
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
