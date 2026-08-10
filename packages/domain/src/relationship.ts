import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Related multi-record people stay as Relationship hints in v0.1 (KD17).
 * Never emit a second PersonDraft for family/related FIO+DOB.
 */
export const RelationshipSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["family", "possible", "colleague", "neighbor", "other"]),
  relationLabel: z.string().optional(),
  relatedPersonId: z.string().uuid().optional(),
  relatedPersonHint: z.object({
    fio: z.string().optional(),
    dob: z.string().optional(),
    phones: z.array(z.string()).optional(),
  }),
  sharedAddress: z.string().optional(),
  strength: z.number().optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type Relationship = z.infer<typeof RelationshipSchema>;
