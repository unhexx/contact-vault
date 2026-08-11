import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Incident / case fact from report sections (v0.1.1).
 * Provenance mandatory (KD1). id optional on draft; present when persisted.
 */
export const IncidentSchema = z.object({
  id: z.string().uuid().optional(),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().optional(),
  body: z.record(z.string()).optional(),
  articleCode: z.string().optional(),
  caseNumber: z.string().optional(),
  sentenceDate: z.string().optional(),
  decision: z.string().optional(),
  region: z.string().optional(),
  tags: z.array(z.string()).optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type Incident = z.infer<typeof IncidentSchema>;
