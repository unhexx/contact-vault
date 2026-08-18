import { describe, expect, it } from "vitest";

import {
  JSCONTACT_VENDOR_PREFIX,
  JSCONTACT_VERSION,
  jsContactFilename,
  phonesEmailsFromJsContact,
  toJsContact,
} from "../src/jscontact.js";
import type { Person } from "../src/person.js";

const personId = "33333333-3333-4333-8333-333333333333";
const reportId = "22222222-2222-4222-8222-222222222222";

const baseProv = {
  reportId,
  sourceName: "synthetic",
  extractedAt: "2026-01-15T12:00:00.000Z",
};

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: personId,
    nameVariants: [],
    contactPoints: [],
    documents: [],
    addresses: [],
    relationships: [],
    riskScores: [],
    incidents: [],
    bankRelations: [],
    sourceReports: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toJsContact", () => {
  it("emits Card 2.0 with uid = Person id and kind individual", () => {
    const card = toJsContact(person());
    expect(card["@type"]).toBe("Card");
    expect(card.version).toBe(JSCONTACT_VERSION);
    expect(card.version).toBe("2.0");
    expect(card.uid).toBe(personId);
    expect(card.kind).toBe("individual");
  });

  it("maps FIO name components (surname, given, given2) and full", () => {
    const card = toJsContact(
      person({
        canonicalName: {
          full: "Иванов Иван Иванович",
          last: "Иванов",
          first: "Иван",
          middle: "Иванович",
          provenance: [baseProv],
        },
      }),
    );
    expect(card.name).toEqual({
      "@type": "Name",
      full: "Иванов Иван Иванович",
      isOrdered: true,
      components: [
        { "@type": "NameComponent", kind: "surname", value: "Иванов" },
        { "@type": "NameComponent", kind: "given", value: "Иван" },
        { "@type": "NameComponent", kind: "given2", value: "Иванович" },
      ],
    });
  });

  it("parses full-only FIO into components", () => {
    const card = toJsContact(
      person({
        nameVariants: [
          {
            full: "Петров Пётр",
            provenance: [baseProv],
          },
        ],
      }),
    );
    expect(card.name?.full).toBe("Петров Пётр");
    expect(card.name?.components).toEqual([
      { "@type": "NameComponent", kind: "surname", value: "Петров" },
      { "@type": "NameComponent", kind: "given", value: "Пётр" },
    ]);
  });

  it("round-trips phones and emails (e164 preferred, raw fallback, pref for primary)", () => {
    const input = person({
      contactPoints: [
        {
          kind: "phone",
          e164: "+79001234567",
          raw: "8 (900) 123-45-67",
          isPrimary: true,
          provenance: [baseProv],
        },
        {
          kind: "phone",
          raw: "bad-phone",
          provenance: [baseProv],
        },
        {
          kind: "email",
          value: "demo@example.com",
          isPrimary: true,
          provenance: [baseProv],
        },
        {
          kind: "email",
          value: "alt@example.com",
          provenance: [baseProv],
        },
        {
          kind: "social",
          network: "vk",
          username: "demo",
          provenance: [baseProv],
        },
      ],
    });

    const card = toJsContact(input);
    expect(card.phones).toEqual({
      "phone-1": {
        "@type": "Phone",
        number: "+79001234567",
        pref: 1,
        label: "8 (900) 123-45-67",
      },
      "phone-2": {
        "@type": "Phone",
        number: "bad-phone",
      },
    });
    expect(card.emails).toEqual({
      "email-1": {
        "@type": "EmailAddress",
        address: "demo@example.com",
        pref: 1,
      },
      "email-2": {
        "@type": "EmailAddress",
        address: "alt@example.com",
      },
    });

    const back = phonesEmailsFromJsContact(card);
    expect(back.phones.map((p) => p.number)).toEqual([
      "+79001234567",
      "bad-phone",
    ]);
    expect(back.emails.map((e) => e.address)).toEqual([
      "demo@example.com",
      "alt@example.com",
    ]);
    expect(back.phones[0]?.isPrimary).toBe(true);
    expect(back.emails[0]?.isPrimary).toBe(true);
  });

  it("passes extras through as unknown properties without overwriting reserved keys", () => {
    const card = toJsContact(
      person({
        extras: {
          profile: { inn: "7700000000" },
          financialFacts: [{ raw: "salary" }],
          uid: "must-not-clobber",
          extra: "reserved-name",
        },
      }),
    );
    expect(card.profile).toEqual({ inn: "7700000000" });
    expect(card.financialFacts).toEqual([{ raw: "salary" }]);
    expect(card.uid).toBe(personId);
    expect(card[`${JSCONTACT_VENDOR_PREFIX}:uid`]).toBe("must-not-clobber");
    expect(card.extra).toBeUndefined();
    expect(card[`${JSCONTACT_VENDOR_PREFIX}:extra`]).toBe("reserved-name");
  });

  it("does not export documents, risk, incidents, banks, or social points", () => {
    const card = toJsContact(
      person({
        documents: [
          {
            type: "snils",
            number: "000-000-000 00",
            provenance: [baseProv],
          },
        ],
        riskScores: [
          {
            overall: 0.9,
            label: "high",
            categories: [],
            articles: [],
            provenance: [baseProv],
          },
        ],
        incidents: [
          {
            severity: "high",
            title: "case",
            provenance: [baseProv],
          },
        ],
        bankRelations: [
          {
            bankName: "ТестБанк",
            provenance: [baseProv],
          },
        ],
        contactPoints: [
          {
            kind: "messenger",
            network: "telegram",
            identifier: "@demo",
            provenance: [baseProv],
          },
        ],
      }),
    );
    expect(card.phones).toBeUndefined();
    expect(card.emails).toBeUndefined();
    expect(card.documents).toBeUndefined();
    expect(card.riskScores).toBeUndefined();
    expect(card.incidents).toBeUndefined();
    expect(card.bankRelations).toBeUndefined();
    expect(card.onlineServices).toBeUndefined();
  });
});

describe("jsContactFilename", () => {
  it("uses the Person UUID", () => {
    expect(jsContactFilename(personId)).toBe(`person-${personId}.json`);
  });
});
