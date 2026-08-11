import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Risk score aggregate from report sections (v0.1.1).
 * overall is normalized 0..1; provenance mandatory (KD1).
 * id optional on draft; present when persisted.
 */
export const RiskScoreSchema = z.object({
  id: z.string().uuid().optional(),
  overall: z.number().min(0).max(1),
  label: z.string().optional(),
  categories: z
    .array(
      z.object({
        name: z.string(),
        flag: z.union([z.literal(0), z.literal(1)]),
      }),
    )
    .default([]),
  articles: z
    .array(
      z.object({
        code: z.string(),
        category: z.string().optional(),
        details: z.string().optional(),
      }),
    )
    .default([]),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type RiskScore = z.infer<typeof RiskScoreSchema>;
