import type {
  Address,
  ContactPoint,
  IdentityDocument,
  NameVariant,
  PersonDraft,
  Relationship,
} from "@contact-vault/domain";
import {
  fioEquals,
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
  acc.documents.push(doc);
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
  if (n.ok) {
    acc.phones.push({
      kind: "phone",
      e164: n.e164,
      raw: n.raw,
      provenance: [
        makeProvenance({
          reportId: ctx.reportId,
          reportQuery: ctx.reportQuery,
          sourceName,
          section: sectionTitle,
          originalKey,
          originalValue: raw,
          extractedAt: ctx.extractedAt,
        }),
      ],
    });
  } else {
    acc.phones.push({
      kind: "phone",
      raw: n.raw,
      provenance: [
        makeProvenance({
          reportId: ctx.reportId,
          reportQuery: ctx.reportQuery,
          sourceName,
          section: sectionTitle,
          originalKey,
          originalValue: raw,
          extractedAt: ctx.extractedAt,
          confidence: 0.5,
        }),
      ],
    });
    warnings.push({
      code: "PHONE_UNNORMALIZED",
      message: `Could not normalize phone to E.164: ${raw}`,
      section: sectionTitle,
      key: originalKey,
      severity: "warn",
    });
  }
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
        acc.emails.push({
          kind: "email",
          value: part,
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
    case "fio": {
      addName(acc, value, ctx, sectionTitle, sourceName, key, undefined, conf);
      break;
    }
    case "personalities": {
      // e.g. "Тестов Тест Тестович 15.01.1990" or comma-separated list
      for (const part of splitMultiValues(value, key)) {
        const dobMatch = part.match(
          /^(.+?)\s+(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})$/,
        );
        if (dobMatch) {
          const fio = dobMatch[1]!.trim();
          const dob = normalizeDate(dobMatch[2]!) ?? dobMatch[2]!;
          addName(acc, fio, ctx, sectionTitle, sourceName, key, dob, conf);
          if (!acc.dateOfBirth) acc.dateOfBirth = dob;
        } else {
          addName(acc, part, ctx, sectionTitle, sourceName, key, undefined, conf);
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
        acc.documents.push({
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
        acc.documents.push({
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
        acc.documents.push({
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
      acc.documents.push({
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
  let reportQuery = ctx.reportQuery;

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

      // KD17: if FIO+DOB clearly differ from primary → Relationship only
      if (
        primaryFio &&
        fio &&
        !fioEquals(fio, primaryFio) &&
        // Require DOB mismatch or missing shared identity when both have DOB
        (dob === undefined ||
          primaryDob === undefined ||
          dob !== primaryDob ||
          !fioEquals(fio, primaryFio))
      ) {
        // Only treat as related when FIO clearly differs
        if (!fioEquals(fio, primaryFio)) {
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
                reportId: ctx.reportId,
                reportQuery: reportQuery ?? ctx.reportQuery,
                sourceName,
                section: section.title,
                originalKey: "ФИО",
                originalValue: fio,
                extractedAt: ctx.extractedAt,
              }),
            ],
          });
          // Do not merge related person's documents into primary
          continue;
        }
      }

      applyRecordToPrimary(
        acc,
        rec,
        { ...ctx, reportQuery: reportQuery ?? ctx.reportQuery },
        section.title,
        sourceName,
        warnings,
        isSummary,
      );

      // Update primary DOB if we just set it
      if (!primaryDob && acc.dateOfBirth) primaryDob = acc.dateOfBirth;
      if (!primaryFio && acc.canonicalName) primaryFio = acc.canonicalName.full;

      // Seed reportQuery from first phone
      if (!reportQuery) {
        const firstPhone = acc.phones.find((p) => p.kind === "phone");
        if (firstPhone?.kind === "phone") {
          reportQuery = firstPhone.e164 ?? firstPhone.raw;
        }
      }
    }
  }

  const contactPoints: ContactPoint[] = [
    ...acc.phones,
    ...acc.emails,
    ...acc.socials,
  ];

  const hasAny =
    acc.canonicalName ||
    contactPoints.length > 0 ||
    acc.documents.length > 0 ||
    acc.addresses.length > 0 ||
    acc.relationships.length > 0 ||
    acc.dateOfBirth ||
    acc.placeOfBirth;

  if (!hasAny) {
    return {
      person: null,
      relationships: [],
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
