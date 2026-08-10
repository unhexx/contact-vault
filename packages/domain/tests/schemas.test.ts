import { describe, expect, it } from "vitest";
import { ContactPointSchema } from "../src/contact-point.js";
import { PersonDraftSchema, PersonSchema } from "../src/person.js";
import { ProvenanceSchema } from "../src/provenance.js";

const reportId = "22222222-2222-4222-8222-222222222222";

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
      id: "33333333-3333-4333-8333-333333333333",
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
