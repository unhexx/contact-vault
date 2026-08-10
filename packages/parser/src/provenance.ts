import type { Provenance } from "@contact-vault/domain";

export type ProvenanceInput = {
  reportId: string;
  reportQuery?: string;
  sourceName: string;
  section?: string;
  originalKey?: string;
  originalValue?: string;
  extractedAt: string;
  confidence?: number;
  count?: number;
};

/** Build mandatory Provenance for a fact (KD1). */
export function makeProvenance(input: ProvenanceInput): Provenance {
  const p: Provenance = {
    reportId: input.reportId,
    sourceName: input.sourceName,
    extractedAt: input.extractedAt,
  };
  if (input.reportQuery !== undefined) p.reportQuery = input.reportQuery;
  if (input.section !== undefined) p.section = input.section;
  if (input.originalKey !== undefined) p.originalKey = input.originalKey;
  if (input.originalValue !== undefined) p.originalValue = input.originalValue;
  if (input.confidence !== undefined) p.confidence = input.confidence;
  if (input.count !== undefined) p.count = input.count;
  return p;
}
