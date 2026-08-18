import type {
  Address,
  ContactPoint,
  Employment,
  FinancialFact,
  IdentityDocument,
  NameVariant,
  Provenance,
  Relationship,
} from "@contact-vault/domain";
import {
  normalizeDocumentNumber,
  normalizeEmail,
} from "@contact-vault/domain";
import {
  classifyRelatedPerson,
  normalizeDate,
  normalizePhone,
  parseFio,
} from "../normalize/index.js";
import { makeProvenance } from "../provenance.js";
import type { ParseWarning } from "../types.js";
import { resolveKeyAlias } from "./keyAliases.js";
import { splitMultiValues, type TextRecord } from "./parseRecord.js";

export type MapContext = {
  reportId: string;
  reportQuery?: string;
  extractedAt: string;
};

export type Accumulator = {
  phones: ContactPoint[];
  emails: ContactPoint[];
  socials: ContactPoint[];
  documents: IdentityDocument[];
  addresses: Address[];
  relationships: Relationship[];
  nameVariants: NameVariant[];
  employments: Employment[];
  financialFacts: FinancialFact[];
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

export function emptyAcc(): Accumulator {
  return {
    phones: [],
    emails: [],
    socials: [],
    documents: [],
    addresses: [],
    relationships: [],
    nameVariants: [],
    employments: [],
    financialFacts: [],
    extras: {},
    passportDraft: {},
  };
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

function addIdDocument(
  acc: Accumulator,
  type: IdentityDocument["type"],
  value: string,
  ctx: MapContext,
  sectionTitle: string,
  sourceName: string,
  originalKey: string,
  confidence: number,
  split: boolean,
): void {
  const parts = split ? splitMultiValues(value, originalKey) : [value];
  for (const part of parts) {
    addDocument(acc, {
      type,
      number: part,
      provenance: [
        makeProvenance({
          reportId: ctx.reportId,
          reportQuery: ctx.reportQuery,
          sourceName,
          section: sectionTitle,
          originalKey,
          originalValue: part,
          extractedAt: ctx.extractedAt,
          confidence,
        }),
      ],
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

function pushEmploymentField(
  acc: Accumulator,
  field: "employer" | "position" | "wish",
  value: string,
  provenance: Provenance[],
): void {
  const last = acc.employments[acc.employments.length - 1];
  if (last && !last[field]) {
    last[field] = value;
    return;
  }
  acc.employments.push({
    [field]: value,
    provenance,
  });
}

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
        for (const part of parts) {
          flushPassport(acc, ctx, sectionTitle, sourceName);
          acc.passportDraft.number = part;
          flushPassport(acc, ctx, sectionTitle, sourceName);
        }
      } else if (parts[0]) {
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
    case "snils":
      addIdDocument(acc, "snils", value, ctx, sectionTitle, sourceName, key, conf, true);
      break;
    case "inn":
      addIdDocument(acc, "inn", value, ctx, sectionTitle, sourceName, key, conf, true);
      break;
    case "oms":
      addIdDocument(acc, "oms", value, ctx, sectionTitle, sourceName, key, conf, true);
      break;
    case "driving_license":
      addIdDocument(
        acc,
        "driving_license",
        value,
        ctx,
        sectionTitle,
        sourceName,
        key,
        conf,
        false,
      );
      break;
    case "address": {
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
    case "employer":
    case "position":
    case "wish": {
      pushEmploymentField(acc, target, value, [
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
      ]);
      break;
    }
    case "income": {
      acc.financialFacts.push({
        amount: value,
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

export function applyRecordToPrimary(
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
