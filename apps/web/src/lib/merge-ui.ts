/**
 * Pure helpers for merge suggestion UI (PR7).
 * Accept always merges newPersonId → targetPersonId (survivor = target).
 */

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
