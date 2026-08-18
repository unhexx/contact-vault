import type { ContactPoint } from "./contact-point.js";
import { parseFio } from "./name.js";
import type { NameVariant, Person } from "./person.js";

/**
 * JSContact Card (RFC 9553 / RFC 9982 v2.0) — identity + contact points only.
 * Does not replace the Person domain model. Documents, risk, incidents, and banks stay out.
 */

export const JSCONTACT_VERSION = "2.0" as const;
export const JSCONTACT_VENDOR_PREFIX = "contact-vault.local";

/** IANA Card property names we must not overwrite with Person extras. */
const RESERVED_CARD_KEYS = new Set([
  "@type",
  "version",
  "uid",
  "kind",
  "created",
  "updated",
  "language",
  "members",
  "prodId",
  "relatedTo",
  "name",
  "nicknames",
  "organizations",
  "speakToAs",
  "titles",
  "emails",
  "onlineServices",
  "phones",
  "preferredLanguages",
  "calendars",
  "schedulingAddresses",
  "addresses",
  "cryptoKeys",
  "directories",
  "links",
  "media",
  "keywords",
  "notes",
  "personalInfo",
  "anniversaries",
  "localizations",
  "extra",
]);

export type JsContactNameComponent = {
  "@type": "NameComponent";
  kind:
    | "title"
    | "given"
    | "given2"
    | "surname"
    | "surname2"
    | "credential"
    | "generation"
    | "separator";
  value: string;
};

export type JsContactName = {
  "@type": "Name";
  full?: string;
  isOrdered?: boolean;
  components?: JsContactNameComponent[];
};

export type JsContactPhone = {
  "@type": "Phone";
  number: string;
  pref?: number;
  label?: string;
};

export type JsContactEmail = {
  "@type": "EmailAddress";
  address: string;
  pref?: number;
};

export type JsContactCard = {
  "@type": "Card";
  version: typeof JSCONTACT_VERSION;
  uid: string;
  kind: "individual";
  name?: JsContactName;
  phones?: Record<string, JsContactPhone>;
  emails?: Record<string, JsContactEmail>;
  [key: string]: unknown;
};

export type JsContactPersonInput = Pick<
  Person,
  "id" | "canonicalName" | "nameVariants" | "contactPoints" | "extras"
>;

function extrasPropertyName(key: string): string {
  if (RESERVED_CARD_KEYS.has(key)) {
    return `${JSCONTACT_VENDOR_PREFIX}:${key}`;
  }
  return key;
}

function toJsContactName(source: NameVariant): JsContactName | undefined {
  let last = source.last?.trim() || undefined;
  let first = source.first?.trim() || undefined;
  let middle = source.middle?.trim() || undefined;
  const full = source.full.trim();

  if (!last && !first && !middle && full) {
    const parsed = parseFio(full);
    last = parsed.last;
    first = parsed.first;
    middle = parsed.middle;
  }

  const components: JsContactNameComponent[] = [];
  // Russian FIO order: surname, given, given2 (отчество).
  if (last) {
    components.push({ "@type": "NameComponent", kind: "surname", value: last });
  }
  if (first) {
    components.push({ "@type": "NameComponent", kind: "given", value: first });
  }
  if (middle) {
    components.push({ "@type": "NameComponent", kind: "given2", value: middle });
  }

  if (components.length === 0 && !full) return undefined;

  const name: JsContactName = { "@type": "Name" };
  if (full) name.full = full;
  if (components.length > 0) {
    name.components = components;
    name.isOrdered = true;
  }
  return name;
}

function toJsContactPhone(cp: Extract<ContactPoint, { kind: "phone" }>): JsContactPhone | undefined {
  const number = cp.e164 ?? cp.raw;
  if (!number) return undefined;
  const phone: JsContactPhone = { "@type": "Phone", number };
  if (cp.isPrimary) phone.pref = 1;
  if (cp.e164 && cp.raw && cp.raw !== cp.e164) {
    phone.label = cp.raw;
  } else if (cp.tags && cp.tags.length > 0) {
    phone.label = cp.tags.join(", ");
  }
  return phone;
}

function toJsContactEmail(cp: Extract<ContactPoint, { kind: "email" }>): JsContactEmail {
  const email: JsContactEmail = { "@type": "EmailAddress", address: cp.value };
  if (cp.isPrimary) email.pref = 1;
  return email;
}

/**
 * Map a persisted Person to a JSContact Card (identity + phones/emails).
 * Person.extras are copied as unknown / vendor-prefixed properties (RFC 9553 §1.7.4).
 */
export function toJsContact(person: JsContactPersonInput): JsContactCard {
  const card: JsContactCard = {
    "@type": "Card",
    version: JSCONTACT_VERSION,
    uid: person.id,
    kind: "individual",
  };

  const nameSource = person.canonicalName ?? person.nameVariants[0];
  if (nameSource) {
    const name = toJsContactName(nameSource);
    if (name) card.name = name;
  }

  const phones: Record<string, JsContactPhone> = {};
  const emails: Record<string, JsContactEmail> = {};
  let phoneN = 0;
  let emailN = 0;

  for (const cp of person.contactPoints) {
    if (cp.kind === "phone") {
      const phone = toJsContactPhone(cp);
      if (!phone) continue;
      phoneN += 1;
      phones[`phone-${phoneN}`] = phone;
    } else if (cp.kind === "email") {
      emailN += 1;
      emails[`email-${emailN}`] = toJsContactEmail(cp);
    }
  }

  if (phoneN > 0) card.phones = phones;
  if (emailN > 0) card.emails = emails;

  if (person.extras) {
    for (const [key, value] of Object.entries(person.extras)) {
      card[extrasPropertyName(key)] = value;
    }
  }

  return card;
}

export type JsContactPhonePoint = { number: string; isPrimary: boolean };
export type JsContactEmailPoint = { address: string; isPrimary: boolean };

/**
 * Read phones/emails back off a Card so stored points can be checked for round-trip.
 */
export function phonesEmailsFromJsContact(card: {
  phones?: Record<string, { number?: unknown; pref?: unknown }>;
  emails?: Record<string, { address?: unknown; pref?: unknown }>;
}): { phones: JsContactPhonePoint[]; emails: JsContactEmailPoint[] } {
  const phones: JsContactPhonePoint[] = [];
  for (const entry of Object.values(card.phones ?? {})) {
    if (typeof entry?.number !== "string" || entry.number.length === 0) continue;
    phones.push({
      number: entry.number,
      isPrimary: entry.pref === 1,
    });
  }

  const emails: JsContactEmailPoint[] = [];
  for (const entry of Object.values(card.emails ?? {})) {
    if (typeof entry?.address !== "string" || entry.address.length === 0) continue;
    emails.push({
      address: entry.address,
      isPrimary: entry.pref === 1,
    });
  }

  return { phones, emails };
}

export function jsContactFilename(personId: string): string {
  return `person-${personId}.json`;
}
