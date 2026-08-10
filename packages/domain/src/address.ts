import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

export const AddressSchema = z.object({
  id: z.string().optional(),
  raw: z.string().min(1),
  normalized: z.string().optional(),
  category: z.enum(["registration", "residence", "delivery", "work", "other"]),
  period: z
    .object({ from: z.string().optional(), to: z.string().optional() })
    .optional(),
  components: z
    .object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      street: z.string().optional(),
      house: z.string().optional(),
      flat: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
  geo: z.object({ lat: z.number(), lon: z.number() }).optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type Address = z.infer<typeof AddressSchema>;
