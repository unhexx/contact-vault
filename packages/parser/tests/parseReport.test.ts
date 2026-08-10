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
import { parseReport } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "..", "fixtures");

/** Fixed synthetic report UUID for tests (KD16). */
const REPORT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function load(rel: string): string {
  return readFileSync(join(fixtures, rel), "utf8");
}

function everyFactHasReportId(
  person: {
    contactPoints: ContactPoint[];
    documents: IdentityDocument[];
    addresses: { provenance: { reportId: string }[] }[];
    relationships: { provenance: { reportId: string }[] }[];
    nameVariants: { provenance: { reportId: string }[] }[];
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
    ...(person.canonicalName ? [person.canonicalName] : []),
  ];
  return buckets.every((f) =>
    f.provenance.every((p) => p.reportId === reportId),
  );
}

describe("parseReport void-html", () => {
  it("happy path: person-basic.embed.html", () => {
    const content = load("void-html/person-basic.embed.html");
    const result = parseReport({
      content,
      filename: "person-basic.embed.html",
      reportId: REPORT_ID,
    });

    expect(result.format).toBe("void-html");
    expect(result.persons).toHaveLength(1);
    expect(result.reportMeta.contentHash).toBe(contentHashOf(content));
    expect(result.reportMeta.reportQuery).toBe("+79000000001");

    const person = result.persons[0]!;
    const parsed = PersonDraftSchema.safeParse(person);
    expect(parsed.success).toBe(true);

    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");
    expect(person.canonicalName?.last).toBe("Тестов");
    expect(person.dateOfBirth).toBe("1990-01-15");
    expect(person.placeOfBirth).toBe("г. Москва");

    const phones = person.contactPoints.filter((c) => c.kind === "phone");
    expect(phones).toHaveLength(1);
    if (phones[0]?.kind === "phone") {
      expect(phones[0].e164).toBe("+79000000001");
    }

    const emails = person.contactPoints.filter((c) => c.kind === "email");
    expect(emails).toHaveLength(1);
    if (emails[0]?.kind === "email") {
      expect(emails[0].value).toBe("testov.fake@example.com");
    }

    expect(person.documents.map((d) => d.type).sort()).toEqual(
      ["passport_ru", "snils"].sort(),
    );
    expect(person.addresses[0]?.raw).toContain("Примерная");

    // KD17: connections → Relationship, still one PersonDraft
    expect(result.persons).toHaveLength(1);
    expect(person.relationships.length).toBeGreaterThanOrEqual(1);
    expect(person.relationships[0]?.relatedPersonHint.fio).toBe(
      "Тестова Анна Тестовна",
    );
    expect(person.relationships[0]?.relationLabel).toBe("ребенок");
    expect(person.relationships[0]?.type).toBe("family");

    // UNMAPPED_SECTION for banks
    expect(
      result.warnings.some((w) => w.code === "UNMAPPED_SECTION" && w.key === "banks"),
    ).toBe(true);

    expect(everyFactHasReportId(person, REPORT_ID)).toBe(true);

    // Fixture contract (expected.json) — structural assertions
    const expected = JSON.parse(
      load("void-html/person-basic.expected.json"),
    ) as {
      format: string;
      personsLength: number;
      phoneE164: string;
      relationshipFio: string;
    };
    expect(result.format).toBe(expected.format);
    expect(result.persons).toHaveLength(expected.personsLength);
    expect(
      person.contactPoints.some(
        (c) => c.kind === "phone" && c.e164 === expected.phoneE164,
      ),
    ).toBe(true);
    expect(
      person.relationships.some(
        (r) => r.relatedPersonHint.fio === expected.relationshipFio,
      ),
    ).toBe(true);
  });

  it("window.__REPORT_EMBED__ + PHONE_UNNORMALIZED", () => {
    const content = load("void-html/person-window-embed.html");
    const result = parseReport({
      content,
      filename: "person-window-embed.html",
      reportId: REPORT_ID,
    });

    expect(result.format).toBe("void-html");
    expect(result.persons).toHaveLength(1);
    const phone = result.persons[0]!.contactPoints.find((c) => c.kind === "phone");
    expect(phone?.kind).toBe("phone");
    if (phone?.kind === "phone") {
      expect(phone.e164).toBeUndefined();
      expect(phone.raw).toBe("not-a-phone");
    }
    expect(
      result.warnings.some((w) => w.code === "PHONE_UNNORMALIZED"),
    ).toBe(true);
  });

  it("EMBED_MISSING → empty persons + error", () => {
    const content =
      "<!DOCTYPE html><html><body><p>no embed here</p></body></html>";
    const result = parseReport({
      content,
      filename: "empty.html",
      reportId: REPORT_ID,
    });
    expect(result.format).toBe("void-html");
    expect(result.persons).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "EMBED_MISSING")).toBe(true);
  });

  it("connections-only embed → no PersonDraft (Issue 7)", () => {
    const content = `<!DOCTYPE html><html><body>
<script id="__report_embed__" type="application/json">
{"status":"ok","query":"+79000000001","data":{"connections":[{"relation":"ребенок","fio":"Тестова Анна Тестовна","dob":"2015-03-01"}]}}
</script></body></html>`;
    const result = parseReport({ content, reportId: REPORT_ID });
    expect(result.persons).toHaveLength(0);
    expect(result.relationships.length).toBeGreaterThanOrEqual(1);
    expect(
      result.warnings.some((w) => w.code === "NO_PRIMARY_IDENTITY"),
    ).toBe(true);
  });
});

describe("parseReport sectioned-text", () => {
  it("happy path: person-basic.txt", () => {
    const content = load("sectioned-text/person-basic.txt");
    const result = parseReport({
      content,
      filename: "person-basic.txt",
      reportId: REPORT_ID,
    });

    expect(result.format).toBe("sectioned-text");
    expect(result.persons).toHaveLength(1);
    expect(result.reportMeta.contentHash).toBe(contentHashOf(content));
    expect(result.reportMeta.reportQuery).toBe("+79000000001");

    const person = result.persons[0]!;
    expect(PersonDraftSchema.safeParse(person).success).toBe(true);

    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");
    expect(person.dateOfBirth).toBe("1990-01-15");
    expect(person.placeOfBirth).toBe("г. Москва");

    // Dedupe: summary + source same e164 → one phone, merged provenance
    const phones = person.contactPoints.filter((c) => c.kind === "phone");
    const e164Phones = phones.filter(
      (p) => p.kind === "phone" && p.e164 === "+79000000001",
    );
    expect(e164Phones).toHaveLength(1);
    if (e164Phones[0]?.kind === "phone") {
      expect(e164Phones[0].provenance.length).toBeGreaterThanOrEqual(2);
      // Issue 1: summary facts also carry reportQuery
      expect(
        e164Phones[0].provenance.every((p) => p.reportQuery === "+79000000001"),
      ).toBe(true);
    }

    const emails = person.contactPoints.filter((c) => c.kind === "email");
    expect(emails.some((e) => e.kind === "email" && e.value === "testov.fake@example.com")).toBe(
      true,
    );
    // Issue 1: name provenance has reportQuery
    expect(
      person.canonicalName?.provenance.every(
        (p) => p.reportQuery === "+79000000001",
      ),
    ).toBe(true);

    expect(person.documents.some((d) => d.type === "snils")).toBe(true);
    expect(person.documents.some((d) => d.type === "passport_ru")).toBe(true);
    expect(person.addresses.some((a) => a.raw.includes("Примерная"))).toBe(true);

    const tg = person.contactPoints.find(
      (c) => c.kind === "messenger" && c.network === "telegram",
    );
    expect(tg).toBeDefined();

    expect(
      result.warnings.some(
        (w) => w.code === "UNKNOWN_KEY" && w.key === "НеизвестныйКлюч",
      ),
    ).toBe(true);

    expect(everyFactHasReportId(person, REPORT_ID)).toBe(true);
  });

  it("multi-record family → single PersonDraft + Relationship hint only (KD17)", () => {
    const content = load("sectioned-text/multi-record-family.txt");
    const result = parseReport({
      content,
      filename: "multi-record-family.txt",
      reportId: REPORT_ID,
    });

    expect(result.format).toBe("sectioned-text");
    expect(result.persons).toHaveLength(1);

    const person = result.persons[0]!;
    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");

    // Child must NOT be a second PersonDraft
    expect(result.persons.length).toBe(1);

    const rel = person.relationships.find(
      (r) => r.relatedPersonHint.fio === "Тестова Анна Тестовна",
    );
    expect(rel).toBeDefined();
    expect(rel?.relatedPersonHint.dob).toBe("2015-03-01");

    // Related person's SNILS must not be absorbed as primary document with that number
    // (primary has 000-000-000 00 only from their own record)
    const snilsNums = person.documents
      .filter((d) => d.type === "snils")
      .map((d) => d.number);
    expect(snilsNums).toContain("000-000-000 00");
    expect(snilsNums).not.toContain("000-000-000 11");
  });

  it("2-token vs 3-token same DOB keeps documents (Issue 2 regression)", () => {
    const content = `=== Общая сводка ===
Личности: Тестов Тест Тестович 15.01.1990
Телефон: +79000000001

=== Источник БезОтчества 2024 ===
ФИО: Тестов Тест
День рождения: 15.01.1990
СНИЛС: 000-000-000 33
`;
    const result = parseReport({ content, reportId: REPORT_ID });
    expect(result.persons).toHaveLength(1);
    const person = result.persons[0]!;
    // Must NOT treat as related / drop SNILS
    expect(
      person.relationships.some(
        (r) => r.relatedPersonHint.fio === "Тестов Тест",
      ),
    ).toBe(false);
    expect(
      person.documents.some(
        (d) => d.type === "snils" && d.number === "000-000-000 33",
      ),
    ).toBe(true);
  });

  it("conflicting отчество + different DOB → related, docs not absorbed (Issue 11)", () => {
    const content = `=== Общая сводка ===
ФИО: Тестов Тест Тестович
День рождения: 15.01.1990
Телефон: +79000000001

=== S ===
ФИО: Тестов Тест Иванович
День рождения: 01.01.1985
СНИЛС: 111-111-111 22
`;
    const result = parseReport({ content, reportId: REPORT_ID });
    expect(result.persons).toHaveLength(1);
    const person = result.persons[0]!;
    expect(
      person.relationships.some(
        (r) => r.relatedPersonHint.fio === "Тестов Тест Иванович",
      ),
    ).toBe(true);
    expect(
      person.documents.some(
        (d) => d.type === "snils" && d.number === "111-111-111 22",
      ),
    ).toBe(false);
  });

  it("sectioned PHONE_UNNORMALIZED path", () => {
    const content = `=== Общая сводка ===
ФИО: Тестов Тест Тестович
Телефон: not-a-real-phone
`;
    const result = parseReport({ content, reportId: REPORT_ID });
    expect(result.persons).toHaveLength(1);
    const phone = result.persons[0]!.contactPoints.find((c) => c.kind === "phone");
    expect(phone?.kind).toBe("phone");
    if (phone?.kind === "phone") {
      expect(phone.e164).toBeUndefined();
      expect(phone.raw).toBe("not-a-real-phone");
    }
    expect(
      result.warnings.some((w) => w.code === "PHONE_UNNORMALIZED"),
    ).toBe(true);
  });

  it("Личности distinct people → Relationship not nameVariants (Issue 4)", () => {
    const content = `=== Общая сводка ===
Телефон: +79000000001
Личности: Тестов Тест Тестович 15.01.1990, Тестова Анна Тестовна 01.03.2015
`;
    const result = parseReport({ content, reportId: REPORT_ID });
    expect(result.persons).toHaveLength(1);
    const person = result.persons[0]!;
    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");
    expect(
      person.nameVariants.some((n) => n.full.includes("Анна")),
    ).toBe(false);
    expect(
      person.relationships.some(
        (r) => r.relatedPersonHint.fio === "Тестова Анна Тестовна",
      ),
    ).toBe(true);
  });
});

describe("parseReport unknown + contentHash stability", () => {
  it("unknown format yields empty persons + warning", () => {
    const content = "random blob without structure";
    const result = parseReport({ content, reportId: REPORT_ID });
    expect(result.format).toBe("unknown");
    expect(result.persons).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "UNKNOWN_FORMAT")).toBe(true);
    expect(result.reportMeta.contentHash).toBe(contentHashOf(content));
  });

  it("contentHash is stable across CRLF vs LF via domain", () => {
    const lf = "=== Общая сводка ===\nТелефон: +79000000001\n";
    const crlf = "=== Общая сводка ===\r\nТелефон: +79000000001\r\n";
    const a = parseReport({ content: lf, reportId: REPORT_ID });
    const b = parseReport({ content: crlf, reportId: REPORT_ID });
    expect(a.reportMeta.contentHash).toBe(b.reportMeta.contentHash);
    expect(a.reportMeta.contentHash).toBe(contentHashOf(lf));
  });

  it("contentHash strips BOM via domain", () => {
    const plain = "=== Общая сводка ===\nТелефон: +79000000001\n";
    const bom = `\uFEFF${plain}`;
    const a = parseReport({ content: plain, reportId: REPORT_ID });
    const b = parseReport({ content: bom, reportId: REPORT_ID });
    expect(a.reportMeta.contentHash).toBe(b.reportMeta.contentHash);
  });

  it("does not assign Person id (KD5)", () => {
    const content = load("void-html/person-basic.embed.html");
    const result = parseReport({ content, reportId: REPORT_ID });
    const person = result.persons[0] as Record<string, unknown>;
    expect(person.id).toBeUndefined();
    expect(PersonDraftSchema.safeParse(result.persons[0]).success).toBe(true);
  });

  it("rejects non-UUID reportId", () => {
    const result = parseReport({
      content: "=== Общая сводка ===\nТелефон: +79000000001\n",
      reportId: "not-a-uuid",
    });
    expect(result.persons).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "INVALID_REPORT_ID")).toBe(
      true,
    );
  });
});
