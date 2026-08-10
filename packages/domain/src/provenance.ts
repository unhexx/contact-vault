import { z } from "zod";

/**
 * Provenance is mandatory on every atomic fact (KD1).
 * reportId equals ReportImport.id generated before parse (KD16).
 */
export const ProvenanceSchema = z.object({
  reportId: z.string().uuid(),
  reportQuery: z.string().optional(),
  sourceName: z.string().min(1),
  section: z.string().optional(),
  originalKey: z.string().optional(),
  originalValue: z.string().optional(),
  extractedAt: z.string().min(1), // ISO-8601 preferred
  confidence: z.number().min(0).max(1).optional(),
  count: z.number().int().nonnegative().optional(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;
