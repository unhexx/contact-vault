import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Income / financial row from report sections (v0.3).
 * Amount stays a string as observed (do not invent currency or masking).
 * Requires amount, raw, or employer. Provenance mandatory (KD1).
 * id optional on draft; present when persisted. Not a merge key.
 */
export const FinancialFactSchema = z
  .object({
    id: z.string().uuid().optional(),
    amount: z.string().trim().min(1).optional(),
    currency: z.string().trim().min(1).optional(),
    year: z.string().trim().min(1).optional(),
    kind: z.string().trim().min(1).optional(),
    employer: z.string().trim().min(1).optional(),
    raw: z.string().trim().min(1).optional(),
    extras: z.record(z.unknown()).optional(),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .refine((f) => Boolean(f.amount || f.raw || f.employer), {
    message: "FinancialFact requires amount, raw, or employer",
  });

export type FinancialFact = z.infer<typeof FinancialFactSchema>;
