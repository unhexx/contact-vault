import type { PersonDraft, Relationship } from "@contact-vault/domain";
import type { ParseWarning } from "../types.js";
import { extractBlocks } from "./extractBlocks.js";
import { extractScoring } from "./extractScoring.js";
import { mapInlineToDomain } from "./mapToDomain.js";
import { splitRecords } from "./splitRecords.js";

export type InlineDossierParseResult = {
  persons: PersonDraft[];
  relationships: Relationship[];
  reportQuery?: string;
  warnings: ParseWarning[];
};

/**
 * inline-dossier pipeline orchestrator:
 * extractScoring → extractBlocks → splitRecords → parseInlineKV → mapToDomain
 */
export function parseInlineDossier(
  content: string,
  opts: { reportId: string; extractedAt: string; reportQuery?: string },
): InlineDossierParseResult {
  const text = (content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const scoring = extractScoring(text);
  const blocks = extractBlocks(text);
  const splitWarnings: ParseWarning[] = [];
  const records = splitRecords(blocks.body, splitWarnings);

  const mapped = mapInlineToDomain(records, scoring, blocks, {
    reportId: opts.reportId,
    reportQuery: opts.reportQuery,
    extractedAt: opts.extractedAt,
  });

  // mapInlineToDomain already includes scoring.warnings; append split warnings
  const warnings = [...mapped.warnings, ...splitWarnings];

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
    // Top-level mirror of primary.relationships (KD38)
    relationships: mapped.person.relationships,
    reportQuery: mapped.reportQuery,
    warnings,
  };
}
