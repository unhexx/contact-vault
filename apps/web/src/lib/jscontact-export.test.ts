import { describe, expect, it } from "vitest";
import type { Person } from "@contact-vault/domain";

import { JSCONTACT_MEDIA_TYPE, jsContactDownload } from "./jscontact-export.js";

const personId = "33333333-3333-4333-8333-333333333333";
const reportId = "22222222-2222-4222-8222-222222222222";

const person: Person = {
  id: personId,
  canonicalName: {
    full: "Иванов Иван",
    last: "Иванов",
    first: "Иван",
    provenance: [
      {
        reportId,
        sourceName: "synthetic",
        extractedAt: "2026-01-15T12:00:00.000Z",
      },
    ],
  },
  nameVariants: [],
  contactPoints: [
    {
      kind: "phone",
      e164: "+79001234567",
      provenance: [
        {
          reportId,
          sourceName: "synthetic",
          extractedAt: "2026-01-15T12:00:00.000Z",
        },
      ],
    },
  ],
  documents: [],
  addresses: [],
  relationships: [],
  riskScores: [],
  incidents: [],
  bankRelations: [],
  sourceReports: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("jsContactDownload", () => {
  it("serializes a Card whose uid is the Person UUID", () => {
    const file = jsContactDownload(person);
    expect(file.filename).toBe(`person-${personId}.json`);
    expect(file.mediaType).toBe(JSCONTACT_MEDIA_TYPE);
    const card = JSON.parse(file.body) as { uid: string; phones?: Record<string, { number: string }> };
    expect(card.uid).toBe(personId);
    expect(Object.values(card.phones ?? {}).map((p) => p.number)).toEqual([
      "+79001234567",
    ]);
  });
});
