import type { ContactPoint, PersonDraft, Relationship } from "@contact-vault/domain";
import {
  classifyRelatedPerson,
  isLikelySamePerson,
  normalizeDate,
  normalizePhone,
} from "../normalize/index.js";
import { makeProvenance } from "../provenance.js";
import type { ParseWarning } from "../types.js";
import {
  applyRecordToPrimary,
  emptyAcc,
  type MapContext,
} from "./applyPair.js";
import { resolveKeyAlias } from "./keyAliases.js";
import {
  parseRecords,
  splitMultiValues,
  type TextRecord,
} from "./parseRecord.js";
import type { TextSection } from "./splitSections.js";

export type { MapContext } from "./applyPair.js";

type ParsedSection = {
  title: string;
  body: string;
  isSummary: boolean;
  sourceName: string;
  records: TextRecord[];
};

function sourceNameFromTitle(title: string): string {
  return title.replace(/\s+\d{4}\s*$/, "").trim() || title;
}

function prepareSections(sections: TextSection[]): ParsedSection[] {
  const summaryIdx = sections.findIndex((s) =>
    /общая\s+сводка/i.test(s.title),
  );
  const ordered =
    summaryIdx >= 0
      ? [sections[summaryIdx]!, ...sections.filter((_, i) => i !== summaryIdx)]
      : sections;
  return ordered.map((section) => {
    const isSummary = /общая\s+сводка/i.test(section.title);
    return {
      title: section.title,
      body: section.body,
      isSummary,
      sourceName: isSummary
        ? "Общая сводка"
        : sourceNameFromTitle(section.title),
      records: parseRecords(section.body),
    };
  });
}

function seedReportQueryFromParsed(
  parsed: ParsedSection[],
  fallback?: string,
): string | undefined {
  if (fallback) return fallback;
  for (const section of parsed) {
    for (const rec of section.records) {
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

/**
 * Pre-scan sections for the first normalizable phone → reportQuery seed.
 * Ensures provenance.reportQuery is set before any makeProvenance call (Issue 1).
 */
export function seedReportQueryFromSections(
  sections: TextSection[],
  fallback?: string,
): string | undefined {
  return seedReportQueryFromParsed(prepareSections(sections), fallback);
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

  const parsed = prepareSections(sections);
  const reportQuery = seedReportQueryFromParsed(parsed, ctx.reportQuery);
  const mapCtx: MapContext = { ...ctx, reportQuery };

  let primaryFio: string | undefined;
  let primaryDob: string | undefined;

  for (const section of parsed) {
    if (section.records.length === 0 && section.body.trim() === "") {
      warnings.push({
        code: "EMPTY_SECTION",
        message: `Empty section: ${section.title}`,
        section: section.title,
        severity: "info",
      });
      continue;
    }

    for (const rec of section.records) {
      const fio = recordFio(rec);
      const dob = recordDob(rec);

      if (!primaryFio && fio) {
        primaryFio = fio;
        primaryDob = dob ?? acc.dateOfBirth;
      }

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
                sourceName: section.sourceName,
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
          continue;
        }

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
        section.sourceName,
        warnings,
        section.isSummary,
      );

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
    bankRelations: [],
    vehicles: [],
    employments: acc.employments,
    financialFacts: acc.financialFacts,
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
