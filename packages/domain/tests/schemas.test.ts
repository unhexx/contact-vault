import { describe, expect, it } from "vitest";
import { AddressSchema } from "../src/address.js";
import { BankRelationSchema } from "../src/bank-relation.js";
import { ContactPointSchema } from "../src/contact-point.js";
import { IdentityDocumentSchema } from "../src/identity-document.js";
import { IncidentSchema } from "../src/incident.js";
import { PersonDraftSchema, PersonSchema } from "../src/person.js";
import { ProvenanceSchema } from "../src/provenance.js";
import { RelationshipSchema } from "../src/relationship.js";
import {
  MergeSuggestionSchema,
  ReportFormatSchema,
} from "../src/report-import.js";
import { RiskScoreSchema } from "../src/risk-score.js";

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
      expect(r.data.riskScores).toEqual([]);
      expect(r.data.incidents).toEqual([]);
      expect(r.data.bankRelations).toEqual([]);
    }
  });

  it("accepts riskScores and incidents on PersonDraft", () => {
    const r = PersonDraftSchema.safeParse({
      riskScores: [
        {
          overall: 0.75,
          label: "elevated",
          categories: [{ name: "fraud", flag: 1 }],
          articles: [{ code: "159", category: "fraud" }],
          provenance: [baseProv],
        },
      ],
      incidents: [
        {
          severity: "high",
          title: "Fraud case",
          articleCode: "159",
          caseNumber: "1-23/2024",
          provenance: [baseProv],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.riskScores).toHaveLength(1);
      expect(r.data.incidents).toHaveLength(1);
    }
  });

  it("accepts bankRelations on PersonDraft", () => {
    const r = PersonDraftSchema.safeParse({
      bankRelations: [
        {
          bankName: "ТестБанк",
          accountHint: "ACCT-000001",
          bik: "000000000",
          provenance: [baseProv],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.bankRelations).toHaveLength(1);
      expect(r.data.bankRelations[0]?.bankName).toBe("ТестБанк");
    }
  });

  it("rejects unknown keys on PersonDraft (strict)", () => {
    const r = PersonDraftSchema.safeParse({
      vehicles: [],
    });
    expect(r.success).toBe(false);
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

  it("accepts name + dob matchedOn (v0.2 matching rule)", () => {
    const r = MergeSuggestionSchema.safeParse({
      newPersonId: personA,
      targetPersonId: personB,
      matchedOn: [
        { field: "name", value: "Тестов Тест Тестович" },
        { field: "dob", value: "1990-01-15" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("RiskScoreSchema", () => {
  it("accepts overall in 0..1 with provenance", () => {
    const r = RiskScoreSchema.safeParse({
      overall: 0.5,
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categories).toEqual([]);
      expect(r.data.articles).toEqual([]);
    }
  });

  it("accepts boundary overall 0 and 1", () => {
    expect(
      RiskScoreSchema.safeParse({ overall: 0, provenance: [baseProv] })
        .success,
    ).toBe(true);
    expect(
      RiskScoreSchema.safeParse({ overall: 1, provenance: [baseProv] })
        .success,
    ).toBe(true);
  });

  it("rejects overall outside 0..1", () => {
    expect(
      RiskScoreSchema.safeParse({ overall: -0.01, provenance: [baseProv] })
        .success,
    ).toBe(false);
    expect(
      RiskScoreSchema.safeParse({ overall: 1.01, provenance: [baseProv] })
        .success,
    ).toBe(false);
  });

  it("requires at least one provenance entry", () => {
    const r = RiskScoreSchema.safeParse({
      overall: 0.3,
      provenance: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts categories flag 0|1 and articles", () => {
    const r = RiskScoreSchema.safeParse({
      overall: 0.9,
      label: "high",
      categories: [
        { name: "fraud", flag: 1 },
        { name: "violence", flag: 0 },
      ],
      articles: [{ code: "159", category: "fraud", details: "details" }],
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid category flag", () => {
    const r = RiskScoreSchema.safeParse({
      overall: 0.5,
      categories: [{ name: "x", flag: 2 }],
      provenance: [baseProv],
    });
    expect(r.success).toBe(false);
  });
});

describe("IncidentSchema", () => {
  it("accepts severity with provenance", () => {
    const r = IncidentSchema.safeParse({
      severity: "medium",
      title: "Case",
      articleCode: "228",
      caseNumber: "1-1/2025",
      sentenceDate: "2025-01-01",
      decision: "guilty",
      region: "Москва",
      tags: ["drugs"],
      body: { note: "text" },
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid severity", () => {
    const r = IncidentSchema.safeParse({
      severity: "critical",
      provenance: [baseProv],
    });
    expect(r.success).toBe(false);
  });

  it("requires at least one provenance entry", () => {
    const r = IncidentSchema.safeParse({
      severity: "low",
      provenance: [],
    });
    expect(r.success).toBe(false);
  });

  it("requires severity", () => {
    const r = IncidentSchema.safeParse({
      title: "no severity",
      provenance: [baseProv],
    });
    expect(r.success).toBe(false);
  });
});

describe("BankRelationSchema", () => {
  it("accepts bankName with provenance", () => {
    const r = BankRelationSchema.safeParse({
      bankName: "ТестБанк",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
  });

  it("trims bankName", () => {
    const r = BankRelationSchema.safeParse({
      bankName: "  ТестБанк  ",
      provenance: [baseProv],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bankName).toBe("ТестБанк");
  });

  it("rejects empty or whitespace-only bankName", () => {
    expect(
      BankRelationSchema.safeParse({ bankName: "", provenance: [baseProv] })
        .success,
    ).toBe(false);
    expect(
      BankRelationSchema.safeParse({ bankName: "   ", provenance: [baseProv] })
        .success,
    ).toBe(false);
  });

  it("requires at least one provenance entry", () => {
    const r = BankRelationSchema.safeParse({
      bankName: "ТестБанк",
      provenance: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("ReportFormatSchema", () => {
  it("includes inline-dossier", () => {
    expect(ReportFormatSchema.safeParse("inline-dossier").success).toBe(true);
    expect(ReportFormatSchema.safeParse("void-html").success).toBe(true);
    expect(ReportFormatSchema.safeParse("sectioned-text").success).toBe(true);
    expect(ReportFormatSchema.safeParse("unknown").success).toBe(true);
    expect(ReportFormatSchema.safeParse("other").success).toBe(false);
  });
});
