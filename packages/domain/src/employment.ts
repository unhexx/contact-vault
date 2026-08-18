import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Employment / workplace from report sections (v0.3).
 * Requires employer or position. Wish and period stay as observed.
 * Provenance mandatory (KD1). id optional on draft; present when persisted.
 * Not a merge key.
 */
export const EmploymentSchema = z
  .object({
    id: z.string().uuid().optional(),
    employer: z.string().trim().min(1).optional(),
    position: z.string().trim().min(1).optional(),
    wish: z.string().trim().min(1).optional(),
    periodFrom: z.string().trim().min(1).optional(),
    periodTo: z.string().trim().min(1).optional(),
    extras: z.record(z.unknown()).optional(),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .refine((e) => Boolean(e.employer || e.position), {
    message: "Employment requires employer or position",
  });

export type Employment = z.infer<typeof EmploymentSchema>;
