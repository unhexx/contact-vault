import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Bank / product relation from report sections (v0.3).
 * bankName required; account stays a hint as observed (do not invent masking).
 * Provenance mandatory (KD1). id optional on draft; present when persisted.
 * Not a merge key.
 */
export const BankRelationSchema = z.object({
  id: z.string().uuid().optional(),
  bankName: z.string().trim().min(1),
  accountHint: z.string().optional(),
  role: z.string().optional(),
  bik: z.string().optional(),
  extras: z.record(z.unknown()).optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type BankRelation = z.infer<typeof BankRelationSchema>;
