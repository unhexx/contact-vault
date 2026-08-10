import { describe, expect, it } from "vitest";
import { AddressSchema } from "../src/address.js";
import { ContactPointSchema } from "../src/contact-point.js";
import { IdentityDocumentSchema } from "../src/identity-document.js";
import { PersonDraftSchema, PersonSchema } from "../src/person.js";
import { ProvenanceSchema } from "../src/provenance.js";
import { RelationshipSchema } from "../src/relationship.js";
import { MergeSuggestionSchema } from "../src/report-import.js";

const reportId = "22222222-2222-4222-8222-222222222222";
const personA = "33333333-3333-4333-8333-333333333333";
const personB = "44444444-4444-4444-8444-444444444444";

const baseProv = {
  reportId,
  sourceName: "synthetic",
  extractedAt: "2026-01-15T12:00:00.000Z",
};

describe("ProvenanceSchema", () => {
  it("requires reportId uuid and sourceName", () => {
    expect(ProvenanceSchema.safeParse(baseProv).success).toBe(true);
    expect(
      ProvenanceSchema.safeParse({
        reportId: "not-uuid",
        sourceName: "x",
        extractedAt: "t",
      }).success,
    ).toBe(false);
  });
});

describe("ContactPointSchema phone (KD15)", () => {
  it("accepts phone with e164 only", () => {
    const r = ContactPointSchema.safeParse({
      kind: "phone",
      e164: "+79001234567",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("accepts phone with raw only (unnormalized)", () => {
    const r = ContactPointSchema.safeParse({
      kind: "phone",
      raw: "bad-phone",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("rejects phone with neither e164 nor raw", () => {
    const r = ContactPointSchema.safeParse({
      kind: "phone",
      provenance: [baseProv],
    });
    expect(r.success).toBe(false);
  });

  it("rejects whitespace-only e164", () => {
    const r = ContactPointSchema.safeParse({
      kind: "phone",
      e164: "   ",
      provenance: [baseProv],
    });
    expect(r.success).toBe(false);
  });

  it("rejects whitespace-only raw when e164 absent", () => {
    const r = ContactPointSchema.safeParse({
      kind: "phone",
      raw: "  ",
      provenance: [baseProv],
    });
    expect(r.success).toBe(false);
  });

  it("trims e164 on parse", () => {
    const r = ContactPointSchema.safeParse({
      kind: "phone",
      e164: "  +79001234567  ",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === "phone") {
      expect(r.data.e164).toBe("+79001234567");
    }
  });

  it("requires at least one provenance entry", () => {
    const r = ContactPointSchema.safeParse({
      kind: "email",
      value: "a@b.ru",
      provenance: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("PersonDraft vs Person (KD5)", () => {
  it("parses PersonDraft without id", () => {
    const r = PersonDraftSchema.safeParse({
      contactPoints: [
        {
          kind: "email",
          value: "demo@example.com",
          provenance: [baseProv],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contactPoints).toHaveLength(1);
      expect(r.data.nameVariants).toEqual([]);
      expect(r.data.documents).toEqual([]);
    }
  });

  it("rejects Person-only id on PersonDraft (strict)", () => {
    const r = PersonDraftSchema.safeParse({
      id: personA,
    });
    expect(r.success).toBe(false);
  });

  it("rejects sourceReports on PersonDraft (strict)", () => {
    const r = PersonDraftSchema.safeParse({
      sourceReports: [],
    });
    expect(r.success).toBe(false);
  });

  it("Person requires id and sourceReports", () => {
    const draftOk = PersonDraftSchema.safeParse({});
    expect(draftOk.success).toBe(true);

    const missingId = PersonSchema.safeParse({
      sourceReports: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(missingId.success).toBe(false);

    const full = PersonSchema.safeParse({
      id: personA,
      sourceReports: [
        {
          reportId,
          query: "+79001234567",
          contentHash: "a".repeat(64),
          importedAt: "2026-01-01T00:00:00.000Z",
          mode: "void_html",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    expect(full.success).toBe(true);
  });
});

describe("IdentityDocumentSchema", () => {
  it("accepts passport with provenance", () => {
    const r = IdentityDocumentSchema.safeParse({
      type: "passport_ru",
      number: "4509 123456",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty provenance", () => {
    const r = IdentityDocumentSchema.safeParse({
      type: "snils",
      number: "000-000-000 00",
      provenance: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("AddressSchema", () => {
  it("accepts registration address with provenance", () => {
    const r = AddressSchema.safeParse({
      raw: "г. Москва, ул. Примерная, д. 1",
      category: "registration",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty provenance", () => {
    const r = AddressSchema.safeParse({
      raw: "somewhere",
      category: "other",
      provenance: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("RelationshipSchema", () => {
  it("requires relatedPersonHint object (may be empty)", () => {
    const missing = RelationshipSchema.safeParse({
      type: "family",
      provenance: [baseProv],
    });
    expect(missing.success).toBe(false);

    const emptyHint = RelationshipSchema.safeParse({
      type: "family",
      relatedPersonHint: {},
      provenance: [baseProv],
    });
    expect(emptyHint.success).toBe(true);

    const withHint = RelationshipSchema.safeParse({
      type: "family",
      relationLabel: "мать",
      relatedPersonHint: { fio: "Иванова А. А.", dob: "01.01.1980" },
      provenance: [baseProv],
    });
    expect(withHint.success).toBe(true);
  });

  it("rejects empty provenance", () => {
    const r = RelationshipSchema.safeParse({
      type: "possible",
      relatedPersonHint: { fio: "X" },
      provenance: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("MergeSuggestionSchema", () => {
  it("accepts distinct persons with matchedOn", () => {
    const r = MergeSuggestionSchema.safeParse({
      newPersonId: personA,
      targetPersonId: personB,
      matchedOn: [{ field: "phone", value: "+79001112233" }],
      status: "open",
    });
    expect(r.success).toBe(true);
  });

  it("rejects self-suggestion (new === target)", () => {
    const r = MergeSuggestionSchema.safeParse({
      newPersonId: personA,
      targetPersonId: personA,
      matchedOn: [{ field: "email", value: "a@b.ru" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty matchedOn", () => {
    const r = MergeSuggestionSchema.safeParse({
      newPersonId: personA,
      targetPersonId: personB,
      matchedOn: [],
    });
    expect(r.success).toBe(false);
  });
});
