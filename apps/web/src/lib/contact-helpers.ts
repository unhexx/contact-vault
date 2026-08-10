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
  "sources",
] as const;

export type Contact360Tab = (typeof CONTACT_360_TABS)[number];

export function isContact360Tab(v: string | null | undefined): v is Contact360Tab {
  return (
    !!v &&
    (CONTACT_360_TABS as readonly string[]).includes(v)
  );
}
