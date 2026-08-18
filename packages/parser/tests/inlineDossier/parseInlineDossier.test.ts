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
import {
  extractBlocks,
  parseIncomesBlock,
} from "../../src/inlineDossier/extractBlocks.js";
import {
  extractScoring,
  normalizeOverallScore,
} from "../../src/inlineDossier/extractScoring.js";
import {
  knownKeysSorted,
  MAX_SCAN_LEN,
  parseInlineKV,
} from "../../src/inlineDossier/parseInlineKV.js";
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
    const { pairs } = parseInlineKV(
      "Имя : Тест Дата выдачи паспорта : 01.06.2015 Паспорт : 00 00 000000",
    );
    const keys = pairs.map((p) => p.key);
    expect(keys).toContain("Дата выдачи паспорта");
    const issued = pairs.find((p) => p.key === "Дата выдачи паспорта");
    expect(issued?.value).toContain("01.06.2015");
  });

  it("flags truncation past MAX_SCAN_LEN (INLINE_KV_TRUNCATED path)", () => {
    const huge = `Имя : ${"A".repeat(MAX_SCAN_LEN + 100)} Телефон : +79001112233`;
    const { pairs, truncated } = parseInlineKV(huge);
    expect(truncated).toBe(true);
    // Phone after the cap is dropped when FIO value alone exceeds the window
    expect(pairs.some((p) => p.key === "Телефон")).toBe(false);
  });
});

describe("extractBlocks source-label boundary (Issue 1)", () => {
  it("does not absorb Label==== Имя into Адреса / Доходы bodies", () => {
    const content = load("inline-dossier", "person-scoring-basic.txt");
    const blocks = extractBlocks(content);
    expect(blocks.addressesRaw).toBeDefined();
    expect(blocks.addressesRaw).not.toMatch(/ИсточникТест/);
    expect(blocks.addressesRaw).toMatch(/Москва/);
    expect(blocks.addressesRaw).toMatch(/Тверь/);

    expect(blocks.incomesRaw).toBeDefined();
    expect(blocks.incomesRaw).not.toMatch(/ИсточникТест/);
    expect(blocks.incomesRaw).toMatch(/ТестСтрой/);
  });

  it("Доходы body excludes next Label==== Имя source token", () => {
    const content = `====Доходы====
ООО Ромашка 100000 2021

LabelSrc==== Имя : Тестов Тест Тестович Телефон : +7 900 000-00-01
`;
    const blocks = extractBlocks(content);
    expect(blocks.incomesRaw).toBeDefined();
    expect(blocks.incomesRaw).not.toMatch(/LabelSrc/);
    const facts = parseIncomesBlock(blocks.incomesRaw!);
    expect(facts.every((f) => !/LabelSrc/i.test(f.raw))).toBe(true);
    expect(facts.some((f) => f.employer?.includes("Ромашка"))).toBe(true);
  });

  it("keeps sole single-token Адреса body (Issue 7 — no over-strip)", () => {
    const content = "====Адреса====\nМосква\n";
    const blocks = extractBlocks(content);
    expect(blocks.addressesRaw).toBe("Москва");
  });

  it("keeps sole Москва before Label==== Имя (Issue 7)", () => {
    const content =
      "====Адреса====\nМосква\nLabel==== Имя : Тестов Тест Тестович Телефон : +7 900 000-00-01\n";
    const blocks = extractBlocks(content);
    expect(blocks.addressesRaw).toBe("Москва");
    expect(blocks.addressesRaw).not.toMatch(/Label/);
  });

  it("stops same-line Label==== Имя without leading newline (Issue 8)", () => {
    const content =
      "====Адреса====\nг. Москва; г. Тверь LabelSrc==== Имя : Тестов Тест Тестович\n";
    const blocks = extractBlocks(content);
    expect(blocks.addressesRaw).toBeDefined();
    expect(blocks.addressesRaw).toMatch(/Москва/);
    expect(blocks.addressesRaw).toMatch(/Тверь/);
    expect(blocks.addressesRaw).not.toMatch(/LabelSrc/);
    expect(blocks.addressesRaw).not.toMatch(/Имя/);
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
    // Full draft validity enforced here (assertions JSON is a thin map, not a draft)
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

    // Addresses: real city blobs only — no source-label junk (Issue 1/2)
    const addressRaws = person.addresses.map((a) => a.raw);
    expect(addressRaws.some((r) => r.includes("Москва"))).toBe(true);
    expect(addressRaws.some((r) => r.includes("Тверь") || r.includes("Примерная"))).toBe(
      true,
    );
    expect(addressRaws.some((r) => /ИсточникТест|СвязанныеИсточник/i.test(r))).toBe(
      false,
    );
    // At least one from Адреса block + one from per-record Адрес
    expect(person.addresses.length).toBeGreaterThanOrEqual(2);
    expect(
      person.addresses.some((a) =>
        a.provenance.some((p) => p.sourceName === "Адреса"),
      ),
    ).toBe(true);

    // financialFacts first-class (from ====Доходы==== lean rows)
    expect((person.financialFacts ?? []).length).toBeGreaterThanOrEqual(1);
    expect(
      person.extras &&
        Array.isArray((person.extras as { financialFacts?: unknown }).financialFacts),
    ).toBeFalsy();
    expect(
      person.financialFacts.every((f) => !/ИсточникТест/i.test(f.raw ?? "")),
    ).toBe(true);
    expect(
      person.financialFacts.some((f) => f.employer?.includes("ТестСтрой")),
    ).toBe(true);
    expect(
      person.employments.some((e) => e.employer?.includes("ТестСтрой")),
    ).toBe(true);

    expect(everyFactHasReportId(person, REPORT_ID)).toBe(true);

    const expected = JSON.parse(
      load("inline-dossier", "person-scoring-basic.assertions.json"),
    ) as {
      format: string;
      personsLength: number;
      phoneE164: string;
      relationshipFio: string;
      minRelationships: number;
      addressContains: string[];
      addressMustNotContain: string[];
    };
    expect(result.format).toBe(expected.format);
    expect(result.persons).toHaveLength(expected.personsLength);
    expect(person.relationships.length).toBeGreaterThanOrEqual(
      expected.minRelationships,
    );
    for (const needle of expected.addressContains) {
      expect(addressRaws.some((r) => r.includes(needle))).toBe(true);
    }
    for (const bad of expected.addressMustNotContain) {
      expect(addressRaws.some((r) => r.includes(bad))).toBe(false);
    }
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

  it("emits INLINE_KV_TRUNCATED warn when record body exceeds scan cap", () => {
    // Scoring header forces inline-dossier detect; huge FIO value trips MAX_SCAN_LEN
    const padding = "X".repeat(MAX_SCAN_LEN + 50);
    const content = `Результаты скоринга
Общий показатель: 0.1
Src==== Имя : Тестов Огромный ${padding} Телефон : +7 900 000-00-99`;
    const result = parseReport({
      content,
      filename: "huge.txt",
      reportId: REPORT_ID,
    });
    expect(result.format).toBe("inline-dossier");
    expect(
      result.warnings.some((w) => w.code === "INLINE_KV_TRUNCATED"),
    ).toBe(true);
  });
});
