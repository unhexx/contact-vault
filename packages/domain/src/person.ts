import { z } from "zod";
import { AddressSchema } from "./address.js";
import { ContactPointSchema } from "./contact-point.js";
import { IdentityDocumentSchema } from "./identity-document.js";
import { IncidentSchema } from "./incident.js";
import { ProvenanceSchema } from "./provenance.js";
import { RelationshipSchema } from "./relationship.js";
import { RiskScoreSchema } from "./risk-score.js";

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
 * Shared Person field shape (draft + persisted).
 * Draft uses `.strict()` so Person-only keys (id, sourceReports, …) are rejected (KD5).
 */
const personFields = {
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
  riskScores: z.array(RiskScoreSchema).default([]),
  incidents: z.array(IncidentSchema).default([]),
  extras: z.record(z.unknown()).optional(),
} as const;

/**
 * Parser output: no stable DB person id (KD5).
 * Optional tempId only; Person UUID assigned on insert by web/db.
 * Strict: unknown keys (including `id` / `sourceReports`) fail parse.
 */
export const PersonDraftSchema = z.object(personFields).strict();

export type PersonDraft = z.infer<typeof PersonDraftSchema>;

/**
 * Persisted aggregate for API/UI: stable UUID, timestamps, source reports.
 */
export const PersonSchema = z
  .object({
    ...personFields,
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
        /** Parse warnings from ReportImport (enriched on get360). */
        warnings: z
          .array(
            z.object({
              code: z.string(),
              message: z.string(),
              section: z.string().optional(),
              key: z.string().optional(),
              severity: z.enum(["info", "warn", "error"]),
            }),
          )
          .optional(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable().optional(),
  })
  .strict();

export type Person = z.infer<typeof PersonSchema>;
