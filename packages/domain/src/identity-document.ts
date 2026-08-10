import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

export const DocumentTypeSchema = z.enum([
  "passport_ru",
  "passport_foreign",
  "snils",
  "inn",
  "oms",
  "driving_license",
  "birth_cert",
  "military",
  "other",
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const IdentityDocumentSchema = z.object({
  id: z.string().optional(),
  type: DocumentTypeSchema,
  number: z.string().min(1),
  series: z.string().optional(),
  issuedAt: z.string().optional(),
  issuedBy: z.string().optional(),
  departmentCode: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(["valid", "invalid", "unknown"]).optional(),
  meta: z.record(z.string()).optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type IdentityDocument = z.infer<typeof IdentityDocumentSchema>;
