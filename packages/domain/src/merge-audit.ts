import { z } from "zod";

/**
 * Person scalars captured on merge so undo can restore the survivor.
 * extras is the JSON value as stored (object, null, or other Json).
 */
export const PersonScalarSnapshotSchema = z.object({
  canonicalFull: z.string().nullable(),
  canonicalLast: z.string().nullable(),
  canonicalFirst: z.string().nullable(),
  canonicalMiddle: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  placeOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
  extras: z.unknown().nullable(),
});

export type PersonScalarSnapshot = z.infer<typeof PersonScalarSnapshotSchema>;

const idList = z.array(z.string().uuid()).default([]);

/** Child ids moved source → target. Missing keys parse as empty (older payloads). */
export const MovedEntityIdsSchema = z.object({
  contactPoints: idList,
  documents: idList,
  addresses: idList,
  relationships: idList,
  nameVariants: idList,
  personSourceReports: idList,
  riskScores: idList,
  incidents: idList,
  bankRelations: idList,
  vehicles: idList,
  employments: idList,
  financialFacts: idList,
});

export type MovedEntityIds = z.infer<typeof MovedEntityIdsSchema>;

export const MergedIntoExistingSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  fromSourceEntityId: z.string().uuid(),
});

export type MergedIntoExisting = z.infer<typeof MergedIntoExistingSchema>;

/**
 * Audit payload for action=merge (entity = survivor Person).
 * Undo reads this; it must not be rewritten.
 */
export const MergeAuditPayloadSchema = z.object({
  sourcePersonId: z.string().uuid(),
  targetPersonId: z.string().uuid(),
  movedEntityIds: MovedEntityIdsSchema,
  skippedPersonSourceReportIds: z.array(z.string().uuid()).default([]),
  mergedIntoExisting: z.array(MergedIntoExistingSchema).default([]),
  suggestionId: z.string().uuid().nullable().optional(),
  targetScalarsBefore: PersonScalarSnapshotSchema.optional(),
  dismissedSuggestionIds: z.array(z.string().uuid()).default([]),
});

export type MergeAuditPayload = z.infer<typeof MergeAuditPayloadSchema>;

export type MergeUndoBlockReason =
  | "missing_target_scalars"
  | "has_collisions"
  | "has_skipped_psr";

export function parseMergeAuditPayload(
  value: unknown,
): MergeAuditPayload | null {
  const parsed = MergeAuditPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * First undo slice: only no-collision merges that recorded targetScalarsBefore.
 * Hard-deleted colliding phones/emails/docs/PSR rows are not restorable yet.
 */
export function mergeUndoBlockReason(
  payload: MergeAuditPayload,
): MergeUndoBlockReason | null {
  if (payload.targetScalarsBefore == null) return "missing_target_scalars";
  if (payload.mergedIntoExisting.length > 0) return "has_collisions";
  if (payload.skippedPersonSourceReportIds.length > 0) return "has_skipped_psr";
  return null;
}
