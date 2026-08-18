import { describe, expect, it } from "vitest";
import {
  collectPersonNames,
  dobsCompatible,
  extractExactMatchKeys,
  normalizeDocumentNumber,
  normalizeEmail,
  scoreExactMatches,
  scoreNameDobMatch,
  unionMatchCandidates,
} from "../src/merge.js";
import type { ContactPoint } from "../src/contact-point.js";
import type { PersonDraft } from "../src/person.js";
import type { Provenance } from "../src/provenance.js";

/** Synthetic provenance — no real PII. */
const prov: Provenance = {
  reportId: "11111111-1111-4111-8111-111111111111",
  sourceName: "fixture-source",
  extractedAt: "2026-01-01T00:00:00.000Z",
};

function draft(partial: Partial<PersonDraft>): PersonDraft {
  return {
    nameVariants: [],
    contactPoints: [],
    documents: [],
    addresses: [],
    relationships: [],
    riskScores: [],
    incidents: [],
    bankRelations: [],
    vehicles: [],
    ...partial,
  };
}

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("is case-insensitive for matching (same norm)", () => {
    expect(normalizeEmail("a@B.Ru")).toBe(normalizeEmail("A@b.ru"));
  });
});

describe("normalizeDocumentNumber", () => {
  it("strips non-digits for SNILS", () => {
    expect(normalizeDocumentNumber("snils", "000-000-000 00")).toBe(
      "00000000000",
    );
  });

  it("strips spaces/dashes for RU passport (digits only)", () => {
    expect(normalizeDocumentNumber("passport_ru", "4509 123456")).toBe(
      "4509123456",
    );
    expect(normalizeDocumentNumber("passport_ru", "45 09-123456")).toBe(
      "4509123456",
    );
  });

  it("digits-only for INN and OMS", () => {
    expect(normalizeDocumentNumber("inn", "500100732259")).toBe("500100732259");
    expect(normalizeDocumentNumber("oms", "1234 5678 9012 3456")).toBe(
      "1234567890123456",
    );
  });

  it("uppercases and strips separators for foreign passport", () => {
    expect(normalizeDocumentNumber("passport_foreign", "ab-123 45")).toBe(
      "AB12345",
    );
  });
});

describe("extractExactMatchKeys", () => {
  it("returns no keys for empty draft", () => {
    expect(extractExactMatchKeys(draft({}))).toEqual([]);
  });

  it("skips phones without e164 (raw-only / unnormalized)", () => {
    const keys = extractExactMatchKeys(
      draft({
        contactPoints: [
          {
            kind: "phone",
            raw: "not-a-phone",
            provenance: [prov],
          },
        ],
      }),
    );
    expect(keys).toEqual([]);
  });

  it("emits phone key only when e164 is defined", () => {
    const keys = extractExactMatchKeys(
      draft({
        contactPoints: [
          {
            kind: "phone",
            e164: "+79001234567",
            raw: "8 (900) 123-45-67",
            provenance: [prov],
          },
          {
            kind: "phone",
            raw: "???",
            provenance: [prov],
          },
        ],
      }),
    );
    expect(keys).toEqual([{ kind: "phone", e164: "+79001234567" }]);
  });

  it("normalizes email case for keys", () => {
    const keys = extractExactMatchKeys(
      draft({
        contactPoints: [
          {
            kind: "email",
            value: "Demo.User@Example.COM",
            provenance: [prov],
          },
        ],
      }),
    );
    expect(keys).toEqual([{ kind: "email", value: "demo.user@example.com" }]);
  });

  it("emits document keys with numberNorm (SNILS / passport)", () => {
    const keys = extractExactMatchKeys(
      draft({
        documents: [
          {
            type: "snils",
            number: "112-233-445 95",
            provenance: [prov],
          },
          {
            type: "passport_ru",
            number: "4509 123456",
            provenance: [prov],
          },
        ],
      }),
    );
    expect(keys).toEqual([
      { kind: "document", type: "snils", number: "11223344595" },
      { kind: "document", type: "passport_ru", number: "4509123456" },
    ]);
  });

  it("deduplicates identical keys", () => {
    const keys = extractExactMatchKeys(
      draft({
        contactPoints: [
          {
            kind: "email",
            value: "a@b.ru",
            provenance: [prov],
          },
          {
            kind: "email",
            value: "A@B.RU",
            provenance: [prov],
          },
        ],
      }),
    );
    expect(keys).toEqual([{ kind: "email", value: "a@b.ru" }]);
  });
});

describe("scoreExactMatches", () => {
  it("returns hits for matching phone, email, document", () => {
    const draftKeys = extractExactMatchKeys(
      draft({
        contactPoints: [
          { kind: "phone", e164: "+79001112233", provenance: [prov] },
          { kind: "email", value: "X@Y.RU", provenance: [prov] },
        ],
        documents: [
          { type: "snils", number: "000-000-000 00", provenance: [prov] },
        ],
      }),
    );

    const hits = scoreExactMatches(draftKeys, {
      phones: ["+79001112233"],
      emails: ["x@y.ru"],
      documents: [{ type: "snils", number: "00000000000" }],
    });

    expect(hits).toEqual([
      { field: "phone", value: "+79001112233" },
      { field: "email", value: "x@y.ru" },
      { field: "document", value: "snils:00000000000" },
    ]);
  });

  it("returns empty when candidate has no overlap", () => {
    const draftKeys = extractExactMatchKeys(
      draft({
        contactPoints: [
          { kind: "phone", e164: "+79001112233", provenance: [prov] },
        ],
      }),
    );
    expect(
      scoreExactMatches(draftKeys, {
        phones: ["+79999999999"],
        emails: [],
        documents: [],
      }),
    ).toEqual([]);
  });

  it("re-normalizes candidate emails and document numbers (defense in depth)", () => {
    const draftKeys = extractExactMatchKeys(
      draft({
        contactPoints: [
          { kind: "email", value: "x@y.ru", provenance: [prov] },
        ],
        documents: [
          { type: "snils", number: "000-000-000 00", provenance: [prov] },
        ],
      }),
    );

    const hits = scoreExactMatches(draftKeys, {
      phones: [],
      emails: ["  X@Y.RU  "],
      documents: [{ type: "snils", number: "000-000-000 00" }],
    });

    expect(hits).toEqual([
      { field: "email", value: "x@y.ru" },
      { field: "document", value: "snils:00000000000" },
    ]);
  });

  it("skips blank/whitespace e164 on draft phones", () => {
    const blankPhone = {
      kind: "phone" as const,
      e164: "   ",
      provenance: [prov],
    } as ContactPoint;
    const keys = extractExactMatchKeys(
      draft({
        contactPoints: [blankPhone],
      }),
    );
    expect(keys).toEqual([]);
  });
});

describe("dobsCompatible", () => {
  it("treats equal and hyphen-boundary prefixes as compatible", () => {
    expect(dobsCompatible("1990-01-15", "1990-01-15")).toBe(true);
    expect(dobsCompatible("1990", "1990-01-15")).toBe(true);
    expect(dobsCompatible("1990-01-15", "1990-01")).toBe(true);
    expect(dobsCompatible("15.01.1990", "1990")).toBe(true);
  });

  it("rejects missing, conflicting full dates, and month clashes", () => {
    expect(dobsCompatible(undefined, "1990-01-15")).toBe(false);
    expect(dobsCompatible("1990-01-15", "")).toBe(false);
    expect(dobsCompatible("1990-01-15", "1991-01-15")).toBe(false);
    expect(dobsCompatible("1990-01", "1990-02")).toBe(false);
    expect(dobsCompatible("1990-01-15", "1990-01-16")).toBe(false);
  });
});

describe("scoreNameDobMatch", () => {
  it("hits last+first (or token-prefix FIO) with compatible partial DOB", () => {
    const hits = scoreNameDobMatch(
      { names: ["Тестов Тест"], dateOfBirth: "1990" },
      { names: ["Тестов Тест Тестович"], dateOfBirth: "1990-01-15" },
    );
    expect(hits).toEqual([
      { field: "name", value: "Тестов Тест" },
      { field: "dob", value: "1990-01-15" },
    ]);
  });

  it("does not hit when DOB is missing on either side", () => {
    expect(
      scoreNameDobMatch(
        { names: ["Тестов Тест Тестович"], dateOfBirth: "1990-01-15" },
        { names: ["Тестов Тест Тестович"] },
      ),
    ).toEqual([]);
    expect(
      scoreNameDobMatch(
        { names: ["Тестов Тест Тестович"] },
        { names: ["Тестов Тест Тестович"], dateOfBirth: "1990-01-15" },
      ),
    ).toEqual([]);
  });

  it("does not hit on conflicting full dates", () => {
    expect(
      scoreNameDobMatch(
        { names: ["Тестов Тест Тестович"], dateOfBirth: "1990-01-15" },
        { names: ["Тестов Тест Тестович"], dateOfBirth: "1991-01-15" },
      ),
    ).toEqual([]);
  });

  it("does not hit on name-only or conflicting отчество", () => {
    expect(
      scoreNameDobMatch(
        { names: ["Тестов Тест Тестович"], dateOfBirth: "1990-01-15" },
        { names: ["Другов Друг Другович"], dateOfBirth: "1990-01-15" },
      ),
    ).toEqual([]);
    expect(
      scoreNameDobMatch(
        { names: ["Тестов Тест Тестович"], dateOfBirth: "1990-01-15" },
        { names: ["Тестов Тест Иванович"], dateOfBirth: "1990-01-15" },
      ),
    ).toEqual([]);
  });
});

describe("collectPersonNames / unionMatchCandidates", () => {
  it("dedupes canonical + variants", () => {
    expect(
      collectPersonNames({
        canonicalName: { full: "Тестов Тест Тестович" },
        canonicalFull: "Тестов Тест Тестович",
        nameVariants: [{ full: "Тестов Тест" }, { full: "Тестов Тест" }],
      }),
    ).toEqual(["Тестов Тест Тестович", "Тестов Тест"]);
  });

  it("unions hits for the same person without merging people", () => {
    const united = unionMatchCandidates(
      [{ personId: "a", matchedOn: [{ field: "phone", value: "+7900" }] }],
      [
        {
          personId: "a",
          matchedOn: [
            { field: "name", value: "Тестов Тест" },
            { field: "dob", value: "1990-01-15" },
          ],
        },
        { personId: "b", matchedOn: [{ field: "name", value: "Другов" }] },
      ],
    );
    const byId = Object.fromEntries(united.map((c) => [c.personId, c.matchedOn]));
    expect(byId.a).toEqual([
      { field: "phone", value: "+7900" },
      { field: "name", value: "Тестов Тест" },
      { field: "dob", value: "1990-01-15" },
    ]);
    expect(byId.b).toEqual([{ field: "name", value: "Другов" }]);
  });
});
