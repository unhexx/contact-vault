import type { ContactPoint, Person } from "@contact-vault/domain";

export function contactPointLabel(cp: ContactPoint): string {
  switch (cp.kind) {
    case "phone":
      return cp.e164 ?? cp.raw ?? "—";
    case "email":
      return cp.value;
    case "social":
      return (
        cp.displayName ||
        cp.username ||
        cp.url ||
        `${cp.network}` ||
        "social"
      );
    case "messenger":
      return `${cp.network}: ${cp.identifier}`;
  }
}

export function contactPointKindLabel(cp: ContactPoint): string {
  switch (cp.kind) {
    case "phone":
      return "Phone";
    case "email":
      return "Email";
    case "social":
      return cp.network || "Social";
    case "messenger":
      return cp.network || "Messenger";
  }
}

export function primaryPhones(person: Person): ContactPoint[] {
  return person.contactPoints.filter((c) => c.kind === "phone");
}

export function primaryEmails(person: Person): ContactPoint[] {
  return person.contactPoints.filter((c) => c.kind === "email");
}

export function documentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    passport_ru: "Passport (RU)",
    passport_foreign: "Passport (foreign)",
    snils: "SNILS",
    inn: "INN",
    oms: "OMS",
    driving_license: "Driving license",
    birth_cert: "Birth certificate",
    military: "Military",
    other: "Other",
  };
  return map[type] ?? type;
}

export const CONTACT_360_TABS = [
  "overview",
  "identity",
  "documents",
  "addresses",
  "network",
  "banks",
  "assets",
  "work",
  "risk",
  "sources",
  "timeline",
] as const;

export type Contact360Tab = (typeof CONTACT_360_TABS)[number];

export function isContact360Tab(v: string | null | undefined): v is Contact360Tab {
  return (
    !!v &&
    (CONTACT_360_TABS as readonly string[]).includes(v)
  );
}

/** Round overall to two decimals — shared by display and tone so they never disagree. */
export function roundRiskOverall(overall: number): number {
  return Math.round(overall * 100) / 100;
}

/** Format risk overall (0..1) for display, e.g. 0.8 */
export function formatRiskOverall(overall: number): string {
  if (!Number.isFinite(overall)) return "—";
  // Prefer one decimal when needed; keep 0 / 1 clean.
  const rounded = roundRiskOverall(overall);
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Color tone for risk overall (≥0.7 destructive, ≥0.4 amber, else muted).
 * Uses the same two-decimal rounding as formatRiskOverall so a displayed
 * "0.7" is never muted (e.g. raw 0.699 → display 0.7 → destructive).
 */
export function riskOverallTone(
  overall: number,
): "destructive" | "warning" | "muted" {
  if (!Number.isFinite(overall)) return "muted";
  const v = roundRiskOverall(overall);
  if (v >= 0.7) return "destructive";
  if (v >= 0.4) return "warning";
  return "muted";
}

/**
 * Prefer the highest overall for Overview teaser after multi-score merges.
 * Stable tie-break: first max wins (lowest index).
 */
export function pickHighestRiskScore<T extends { overall: number }>(
  scores: readonly T[],
): T | undefined {
  if (scores.length === 0) return undefined;
  let best = scores[0]!;
  for (let i = 1; i < scores.length; i++) {
    const next = scores[i]!;
    if (next.overall > best.overall) best = next;
  }
  return best;
}

/** Badge variant for person-timeline actions. */
export function timelineActionVariant(
  action: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (action) {
    case "merge":
    case "unmerge":
      return "default";
    case "dismiss":
      return "outline";
    case "soft_delete":
      return "destructive";
    case "import":
    default:
      return "secondary";
  }
}

export function timelineActionLabel(action: string): string {
  switch (action) {
    case "import":
      return "Import";
    case "merge":
      return "Merge";
    case "unmerge":
      return "Unmerge";
    case "dismiss":
      return "Dismiss";
    case "soft_delete":
      return "Soft-delete";
    default:
      return action;
  }
}

/** Badge variant for incident severity. */
export function incidentSeverityVariant(
  severity: "high" | "medium" | "low",
): "destructive" | "warning" | "secondary" {
  switch (severity) {
    case "high":
      return "destructive";
    case "medium":
      return "warning";
    case "low":
    default:
      return "secondary";
  }
}
