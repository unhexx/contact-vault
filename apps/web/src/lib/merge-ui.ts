/**
 * Pure helpers for merge suggestion UI (PR7) and operator undo.
 * Accept always merges newPersonId → targetPersonId (survivor = target).
 */

import {
  mergeUndoBlockReason,
  parseMergeAuditPayload,
} from "@contact-vault/domain";

export type MatchedOnField = {
  field: string;
  value: string;
};

export type EntityCounts = {
  contactPoints: number;
  documents: number;
  addresses: number;
  relationships: number;
  nameVariants: number;
  personSourceReports: number;
  riskScores: number;
  incidents: number;
  bankRelations: number;
  vehicles: number;
  employments: number;
  financialFacts: number;
};

const ENTITY_LABELS: Record<keyof EntityCounts, string> = {
  contactPoints: "Contact points",
  documents: "Documents",
  addresses: "Addresses",
  relationships: "Relationships",
  nameVariants: "Name variants",
  personSourceReports: "Source reports",
  riskScores: "Risk scores",
  incidents: "Incidents",
  bankRelations: "Banks",
  vehicles: "Vehicles",
  employments: "Employments",
  financialFacts: "Financial facts",
};

const FIELD_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  document: "Document",
  name: "Name",
  dob: "Date of birth",
};

export function matchedFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function formatMatchedOn(
  matchedOn: MatchedOnField[] | unknown,
): string {
  const list = asMatchedOn(matchedOn);
  if (list.length === 0) return "—";
  return list.map((m) => `${matchedFieldLabel(m.field)}: ${m.value}`).join(", ");
}

export function asMatchedOn(value: unknown): MatchedOnField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is MatchedOnField =>
      !!m &&
      typeof m === "object" &&
      typeof (m as MatchedOnField).field === "string" &&
      typeof (m as MatchedOnField).value === "string",
  );
}

export function entityCountLabel(key: keyof EntityCounts): string {
  return ENTITY_LABELS[key];
}

export function entityCountEntries(
  counts: EntityCounts,
): Array<{ key: keyof EntityCounts; label: string; count: number }> {
  return (Object.keys(ENTITY_LABELS) as Array<keyof EntityCounts>).map(
    (key) => ({
      key,
      label: ENTITY_LABELS[key],
      count: counts[key] ?? 0,
    }),
  );
}

export function totalEntityCount(counts: EntityCounts): number {
  return entityCountEntries(counts).reduce((sum, e) => sum + e.count, 0);
}

/** Human-readable merge direction (always new → target). */
export function mergeDirectionLabel(): string {
  return "New person → Target (survivor)";
}

/**
 * Operator-facing undo disable reasons.
 * Domain `mergeUndoBlockReason` covers legacy payloads; siblings cover
 * already-undone / later-merge (server still refuses those).
 */
export type MergeUndoUiReason =
  | "not_merge"
  | "bad_payload"
  | "missing_target_scalars"
  | "has_collisions"
  | "has_skipped_psr"
  | "already_undone"
  | "superseded";

export type MergeUndoTimelineEvent = {
  id: string;
  action: string;
  at: string;
  payload?: unknown;
};

function payloadMergeAuditId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const id = (payload as { mergeAuditId?: unknown }).mergeAuditId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function isLaterThan(
  candidate: MergeUndoTimelineEvent,
  event: MergeUndoTimelineEvent,
): boolean {
  if (candidate.at !== event.at) return candidate.at > event.at;
  return candidate.id > event.id;
}

/**
 * Why the operator Undo control must stay disabled.
 * Returns null when merge.undo may be offered.
 */
export function mergeUndoDisabledReason(
  event: MergeUndoTimelineEvent,
  siblings: readonly MergeUndoTimelineEvent[] = [],
): MergeUndoUiReason | null {
  if (event.action !== "merge") return "not_merge";
  const payload = parseMergeAuditPayload(event.payload);
  if (!payload) return "bad_payload";
  const blocked = mergeUndoBlockReason(payload);
  if (blocked) return blocked;

  for (const sibling of siblings) {
    if (sibling.action !== "unmerge" || sibling.id === event.id) continue;
    if (payloadMergeAuditId(sibling.payload) === event.id) {
      return "already_undone";
    }
  }

  for (const sibling of siblings) {
    if (sibling.action !== "merge" || sibling.id === event.id) continue;
    if (isLaterThan(sibling, event)) return "superseded";
  }

  return null;
}

export function mergeUndoReasonLabel(reason: MergeUndoUiReason): string {
  switch (reason) {
    case "not_merge":
      return "Not a merge event";
    case "bad_payload":
      return "Audit payload is not a restorable merge record";
    case "missing_target_scalars":
      return "Legacy merge cannot be undone (missing target scalars)";
    case "has_collisions":
    case "has_skipped_psr":
      return "Legacy collision merge cannot be undone";
    case "already_undone":
      return "This merge was already undone";
    case "superseded":
      return "A later merge superseded this event";
  }
}
