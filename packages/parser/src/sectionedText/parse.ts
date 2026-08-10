import type { PersonDraft, Relationship } from "@contact-vault/domain";
import type { ParseWarning } from "../types.js";
import { mapSectionsToDomain } from "./mapToDomain.js";
import { splitSections } from "./splitSections.js";

export type SectionedTextParseResult = {
  persons: PersonDraft[];
  relationships: Relationship[];
  reportQuery?: string;
  warnings: ParseWarning[];
};

/**
 * sectioned-text pipeline: splitSections → records → domain (KD17).
 */
export function parseSectionedText(
  content: string,
  opts: { reportId: string; extractedAt: string; reportQuery?: string },
): SectionedTextParseResult {
  const sections = splitSections(content);
  const mapped = mapSectionsToDomain(sections, {
    reportId: opts.reportId,
    reportQuery: opts.reportQuery,
    extractedAt: opts.extractedAt,
  });

  const warnings: ParseWarning[] = [...mapped.warnings];

  if (!mapped.person) {
    return {
      persons: [],
      relationships: mapped.relationships,
      reportQuery: mapped.reportQuery,
      warnings,
    };
  }

  return {
    persons: [mapped.person],
    relationships: mapped.relationships,
    reportQuery: mapped.reportQuery,
    warnings,
  };
}
