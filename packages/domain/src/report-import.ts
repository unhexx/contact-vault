import { z } from "zod";

/** v0.1 supported formats (KD8); unknown for detect failures. */
export const ReportFormatSchema = z.enum([
  "void-html",
  "sectioned-text",
  "unknown",
]);

export type ReportFormat = z.infer<typeof ReportFormatSchema>;

/**
 * Exact-match merge suggestion only (KD3, KD6, KD21).
 * newPersonId = newly created; targetPersonId = existing candidate.
 * Never target === new.
 */
export const MergeSuggestionSchema = z.object({
  id: z.string().uuid().optional(),
  newPersonId: z.string().uuid(),
  targetPersonId: z.string().uuid(),
  matchedOn: z.array(
    z.object({
      field: z.enum(["phone", "email", "document"]),
      value: z.string(),
    }),
  ),
  status: z.enum(["open", "accepted", "dismissed"]).optional(),
});

export type MergeSuggestion = z.infer<typeof MergeSuggestionSchema>;
