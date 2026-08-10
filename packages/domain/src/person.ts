import { z } from "zod";
import { AddressSchema } from "./address.js";
import { ContactPointSchema } from "./contact-point.js";
import { IdentityDocumentSchema } from "./identity-document.js";
import { ProvenanceSchema } from "./provenance.js";
import { RelationshipSchema } from "./relationship.js";

export const NameVariantSchema = z.object({
  full: z.string().min(1),
  last: z.string().optional(),
  first: z.string().optional(),
  middle: z.string().optional(),
  dobHint: z.string().optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

export type NameVariant = z.infer<typeof NameVariantSchema>;

/**
 * Parser output: no stable DB person id (KD5).
 * Optional tempId only; Person UUID assigned on insert by web/db.
 */
export const PersonDraftSchema = z.object({
  tempId: z.string().optional(),
  canonicalName: NameVariantSchema.optional(),
  nameVariants: z.array(NameVariantSchema).default([]),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  contactPoints: z.array(ContactPointSchema).default([]),
  documents: z.array(IdentityDocumentSchema).default([]),
  addresses: z.array(AddressSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  extras: z.record(z.unknown()).optional(),
});

export type PersonDraft = z.infer<typeof PersonDraftSchema>;

/**
 * Persisted aggregate for API/UI: stable UUID, timestamps, source reports.
 */
export const PersonSchema = PersonDraftSchema.extend({
  id: z.string().uuid(),
  sourceReports: z.array(
    z.object({
      reportId: z.string().uuid(), // ReportImport.id
      query: z.string(),
      contentHash: z.string(),
      importedAt: z.string(),
      mode: z
        .enum([
          "void_html",
          "text_export",
          "inline_dossier",
          "telegram",
          "fio",
          "facesearch",
          "other",
        ])
        .optional(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});

export type Person = z.infer<typeof PersonSchema>;
