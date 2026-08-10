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

    // UNMAPPED_SECTION for banks
    expect(
      result.warnings.some((w) => w.code === "UNMAPPED_SECTION" && w.key === "banks"),
    ).toBe(true);

    expect(everyFactHasReportId(person, REPORT_ID)).toBe(true);
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

    const person = result.persons[0]!;
    expect(PersonDraftSchema.safeParse(person).success).toBe(true);

    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");
    expect(person.dateOfBirth).toBe("1990-01-15");
    expect(person.placeOfBirth).toBe("г. Москва");

    const phones = person.contactPoints.filter((c) => c.kind === "phone");
    expect(phones.some((p) => p.kind === "phone" && p.e164 === "+79000000001")).toBe(
      true,
    );

    const emails = person.contactPoints.filter((c) => c.kind === "email");
    expect(emails.some((e) => e.kind === "email" && e.value === "testov.fake@example.com")).toBe(
      true,
    );

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

  it("does not assign Person id (KD5)", () => {
    const content = load("void-html/person-basic.embed.html");
    const result = parseReport({ content, reportId: REPORT_ID });
    const person = result.persons[0] as Record<string, unknown>;
    expect(person.id).toBeUndefined();
    expect(PersonDraftSchema.safeParse(result.persons[0]).success).toBe(true);
  });
});
