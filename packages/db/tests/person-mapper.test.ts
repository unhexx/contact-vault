import { describe, expect, it } from "vitest";
import { toDomainPerson, type PersonWithChildren } from "../src/mappers/person-mapper.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const reportId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const personId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

const provenance = [
  {
    reportId,
    sourceName: "test",
    extractedAt: now.toISOString(),
  },
];

function row(
  overrides: Partial<PersonWithChildren> & {
    nameVariants?: PersonWithChildren["nameVariants"];
  },
): PersonWithChildren {
  return {
    id: personId,
    canonicalFull: "Тестов Тест Тестович",
    canonicalLast: "Тестов",
    canonicalFirst: "Тест",
    canonicalMiddle: "Тестович",
    dateOfBirth: null,
    placeOfBirth: null,
    gender: null,
    extras: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    contactPoints: [],
    documents: [],
    addresses: [],
    relationships: [],
    riskScores: [],
    incidents: [],
    bankRelations: [],
    vehicles: [],
    nameVariants: [
      {
        id: "11111111-2222-4333-8444-555555555555",
        personId,
        full: "Тестов Тест Тестович",
        last: "Тестов",
        first: "Тест",
        middle: "Тестович",
        dobHint: null,
        provenance,
        createdAt: now,
      },
    ],
    sourceReports: [
      {
        id: "22222222-3333-4444-8555-666666666666",
        personId,
        reportImportId: reportId,
        query: "q",
        contentHash: "aa".repeat(32),
        mode: "void_html",
        importedAt: now,
        reportImport: {
          warnings: [
            {
              code: "UNKNOWN_KEY",
              message: "x",
              severity: "info",
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe("toDomainPerson nameVariants", () => {
  it("does not list the canonical name twice", () => {
    const person = toDomainPerson(row({}));
    expect(person.canonicalName?.full).toBe("Тестов Тест Тестович");
    expect(person.nameVariants).toEqual([]);
    const listed = [
      ...(person.canonicalName ? [person.canonicalName.full] : []),
      ...person.nameVariants.map((nv) => nv.full),
    ];
    expect(listed.filter((n) => n === "Тестов Тест Тестович")).toHaveLength(1);
  });

  it("keeps extras that differ from canonical", () => {
    const person = toDomainPerson(
      row({
        nameVariants: [
          {
            id: "11111111-2222-4333-8444-555555555555",
            personId,
            full: "Тестов Тест Тестович",
            last: "Тестов",
            first: "Тест",
            middle: "Тестович",
            dobHint: null,
            provenance,
            createdAt: now,
          },
          {
            id: "33333333-4444-4555-8666-777777777777",
            personId,
            full: "Вариантов Вариант",
            last: "Вариантов",
            first: "Вариант",
            middle: null,
            dobHint: null,
            provenance,
            createdAt: now,
          },
        ],
      }),
    );
    expect(person.nameVariants.map((nv) => nv.full)).toEqual(["Вариантов Вариант"]);
  });

  it("includes report-import warnings on sourceReports", () => {
    const person = toDomainPerson(row({}));
    expect(person.sourceReports[0]?.warnings).toEqual([
      { code: "UNKNOWN_KEY", message: "x", severity: "info" },
    ]);
  });
});
