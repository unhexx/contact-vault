import { z } from "zod";

/** v0.1 supported formats (KD8); unknown for detect failures. */
export const ReportFormatSchema = z.enum([
  "void-html",
  "sectioned-text",
  "inline-dossier",
  "unknown",
]);

export type ReportFormat = z.infer<typeof ReportFormatSchema>;

/**
 * Merge suggestion (KD3, KD6, KD21). Matching rules only — never a merge.
 * newPersonId = newly created; targetPersonId = existing candidate.
 * Schema enforces: never self-suggestion; at least one matched field.
 */
export const MatchedOnFieldSchema = z.object({
  field: z.enum(["phone", "email", "document", "name", "dob"]),
  value: z.string().min(1),
});

export const MergeSuggestionSchema = z
  .object({
    id: z.string().uuid().optional(),
    newPersonId: z.string().uuid(),
    targetPersonId: z.string().uuid(),
    matchedOn: z.array(MatchedOnFieldSchema).min(1),
    status: z.enum(["open", "accepted", "dismissed"]).optional(),
  })
  .refine((s) => s.newPersonId !== s.targetPersonId, {
    message: "newPersonId must not equal targetPersonId (no self-suggestion)",
    path: ["targetPersonId"],
  });

export type MergeSuggestion = z.infer<typeof MergeSuggestionSchema>;
