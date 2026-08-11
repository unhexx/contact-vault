import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentHashOf,
  PersonDraftSchema,
  type ContactPoint,
  type IdentityDocument,
} from "@contact-vault/domain";
import { describe, expect, it } from "vitest";
import { parseInlineKV, knownKeysSorted } from "../../src/inlineDossier/parseInlineKV.js";
import { extractScoring, normalizeOverallScore } from "../../src/inlineDossier/extractScoring.js";
import { parseReport } from "../../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "..", "..", "fixtures");
const REPORT_ID = "11111111-1111-4111-8111-111111111111";

function load(...parts: string[]): string {
  return readFileSync(join(fixtures, ...parts), "utf8");
}

function everyFactHasReportId(
  person: {
    contactPoints: ContactPoint[];
    documents: IdentityDocument[];
    addresses: { provenance: { reportId: string }[] }[];
    relationships: { provenance: { reportId: string }[] }[];
    nameVariants: { provenance: { reportId: string }[] }[];
    riskScores: { provenance: { reportId: string }[] }[];
    incidents: { provenance: { reportId: string }[] }[];
    canonicalName?: { provenance: { reportId: string }[] };
  },
  reportId: string,
): boolean {
  const buckets = [
    ...person.contactPoints,
    ...person.documents,
    ...person.addresses,
    ...person.relationships,
    ...person.nameVariants,
    ...person.riskScores,
    ...person.incidents,
    ...(person.canonicalName ? [person.canonicalName] : []),
  ];
  return buckets.every((f) =>
    f.provenance.every((p) => p.reportId === reportId),
  );
}

describe("normalizeOverallScore KD39", () => {
  it("keeps [0,1]", () => {
    expect(normalizeOverallScore("0.8")).toEqual({ overall: 0.8 });
    expect(normalizeOverallScore("0")).toEqual({ overall: 0 });
    expect(normalizeOverallScore("1")).toEqual({ overall: 1 });
  });

  it("divides (1,100]", () => {
    expect(normalizeOverallScore("80")).toEqual({ overall: 0.8 });
    expect(normalizeOverallScore("100")).toEqual({ overall: 1 });
  });

  it("rejects invalid without clamping to 1.0", () => {
    expect(normalizeOverallScore("101")).toEqual({ error: true });
    expect(normalizeOverallScore("-1")).toEqual({ error: true });
    expect(normalizeOverallScore("abc")).toEqual({ error: true });
  });
});

describe("parseInlineKV longest-key-first", () => {
  it("sorts keys longest first", () => {
    const keys = knownKeysSorted();
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]!.length).toBeGreaterThanOrEqual(keys[i]!.length);
    }
  });

  it("prefers Дата выдачи паспорта over Дата", () => {
    const pairs = parseInlineKV(
      "Имя : Тест Дата выдачи паспорта : 01.06.2015 Паспорт : 00 00 000000",
    );
    const keys = pairs.map((p) => p.key);
    expect(keys).toContain("Дата выдачи паспорта");
    const issued = pairs.find((p) => p.key === "Дата выдачи паспорта");
    expect(issued?.value).toContain("01.06.2015");
  });
});

describe("extractScoring", () => {
  it("parses overall, categories, articles from fixture header", () => {
    const content = load("inline-dossier", "person-scoring-basic.txt");
    const s = extractScoring(content);
    expect(s.riskScore?.overall).toBe(0.8);
    expect(s.riskScore?.label).toMatch(/плохо/i);
    expect(s.riskScore?.categories).toEqual(
      expect.arrayContaining([
        { name: "наркотики", flag: 1 },
        { name: "мошенничество", flag: 0 },
      ]),
    );
    expect(s.incidents.some((i) => i.articleCode?.includes("228"))).toBe(true);
  });
});

describe("parseReport inline-dossier", () => {
  it("happy path: person-scoring-basic golden", () => {
    const content = load("inline-dossier", "person-scoring-basic.txt");
    const result = parseReport({
      content,
      filename: "person-scoring-basic.txt",
      reportId: REPORT_ID,
    });

    expect(result.format).toBe("inline-dossier");
    expect(result.persons).toHaveLength(1);
    expect(result.reportMeta.contentHash).toBe(contentHashOf(content));

    const person = result.persons[0]!;
    const parsed = PersonDraftSchema.safeParse(person);
    if (!parsed.success) {
      console.error(parsed.error.issues);
    }
    expect(parsed.success).toBe(true);

    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");
    expect(person.dateOfBirth).toBe("1990-01-15");

    const phones = person.contactPoints.filter((c) => c.kind === "phone");
    expect(
      phones.some((p) => p.kind === "phone" && p.e164 === "+79000000001"),
    ).toBe(true);

    const emails = person.contactPoints.filter((c) => c.kind === "email");
    expect(
      emails.some(
        (e) => e.kind === "email" && e.value === "testov.fake@example.com",
      ),
    ).toBe(true);

    expect(person.documents.some((d) => d.type === "passport_ru")).toBe(true);
    expect(person.documents.some((d) => d.type === "snils")).toBe(true);

    // RiskScore
    expect(person.riskScores.length).toBeGreaterThanOrEqual(1);
    expect(person.riskScores[0]!.overall).toBe(0.8);
    expect(person.riskScores[0]!.label).toMatch(/плохо/i);
    expect(person.riskScores[0]!.provenance[0]!.sourceName).toBe("Скоринг");

    // Incidents from articles
    expect(
      person.incidents.some((i) => i.articleCode?.includes("228")),
    ).toBe(true);

    // KD38: relationships on PersonDraft (authority)
    expect(person.relationships.length).toBeGreaterThanOrEqual(1);
    const rel = person.relationships.find(
      (r) => r.relatedPersonHint.fio === "Тестова Анна Тестовна",
    );
    expect(rel).toBeDefined();
    expect(rel?.relationLabel).toBe("ребенок");

    // KD17: single person
    expect(result.persons).toHaveLength(1);

    // Top-level mirror
    expect(result.relationships.length).toBeGreaterThanOrEqual(1);

    // Provenance sourceName from label
    expect(
      person.canonicalName?.provenance.some((p) =>
        p.sourceName.includes("ИсточникТест"),
      ),
    ).toBe(true);

    // financialFacts in extras
    expect(
      Array.isArray(person.extras?.financialFacts) &&
        (person.extras!.financialFacts as unknown[]).length >= 1,
    ).toBe(true);

    expect(everyFactHasReportId(person, REPORT_ID)).toBe(true);

    const expected = JSON.parse(
      load("inline-dossier", "person-scoring-basic.expected.json"),
    ) as {
      format: string;
      personsLength: number;
      phoneE164: string;
      relationshipFio: string;
      minRelationships: number;
    };
    expect(result.format).toBe(expected.format);
    expect(result.persons).toHaveLength(expected.personsLength);
    expect(person.relationships.length).toBeGreaterThanOrEqual(
      expected.minRelationships,
    );
  });

  it("scoring-only → empty persons + SCORING_ONLY_NO_PERSON", () => {
    const content = load("inline-dossier", "scoring-only.txt");
    const result = parseReport({
      content,
      filename: "scoring-only.txt",
      reportId: REPORT_ID,
    });
    expect(result.format).toBe("inline-dossier");
    expect(result.persons).toHaveLength(0);
    expect(
      result.warnings.some((w) => w.code === "SCORING_ONLY_NO_PERSON"),
    ).toBe(true);
  });

  it("dense-inline-no-scoring parses person without risk", () => {
    const content = load("inline-dossier", "dense-inline-no-scoring.txt");
    const result = parseReport({
      content,
      filename: "dense-inline-no-scoring.txt",
      reportId: REPORT_ID,
    });
    expect(result.format).toBe("inline-dossier");
    expect(result.persons).toHaveLength(1);
    const person = result.persons[0]!;
    expect(PersonDraftSchema.safeParse(person).success).toBe(true);
    expect(person.canonicalName?.full).toContain("Плотный");
    expect(person.riskScores).toHaveLength(0);
  });
});
