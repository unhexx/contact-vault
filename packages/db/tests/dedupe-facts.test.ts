import { describe, expect, it } from "vitest";
import type { ContactPoint, IdentityDocument, Provenance } from "@contact-vault/domain";
import { dedupeContactPoints, dedupeDocuments } from "../src/dedupe-facts.js";

const p = (originalValue: string): Provenance[] => [
  {
    reportId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    sourceName: "test",
    extractedAt: "2026-01-01T00:00:00.000Z",
    originalValue,
  },
];

describe("dedupeDocuments", () => {
  it("merges same type+numberNorm and fills missing issued fields", () => {
    const docs: IdentityDocument[] = [
      { type: "snils", number: "112-233-445 95", provenance: p("a") },
      {
        type: "snils",
        number: "11223344595",
        issuedAt: "2010-01-01",
        issuedBy: "ПФР",
        provenance: p("b"),
      },
    ];
    const out = dedupeDocuments(docs);
    expect(out).toHaveLength(1);
    expect(out[0]?.issuedAt).toBe("2010-01-01");
    expect(out[0]?.issuedBy).toBe("ПФР");
    expect(out[0]?.provenance).toHaveLength(2);
  });

  it("keeps distinct types separate", () => {
    const docs: IdentityDocument[] = [
      { type: "snils", number: "11223344595", provenance: p("a") },
      { type: "inn", number: "11223344595", provenance: p("b") },
    ];
    expect(dedupeDocuments(docs)).toHaveLength(2);
  });
});

describe("dedupeContactPoints", () => {
  it("merges phones by e164 and emails by emailNorm", () => {
    const points: ContactPoint[] = [
      { kind: "phone", e164: "+79990001122", provenance: p("p1") },
      { kind: "phone", e164: "+79990001122", raw: "+7 999 000 11 22", provenance: p("p2") },
      { kind: "email", value: "Alice.Test@example.com", provenance: p("e1") },
      { kind: "email", value: "alice.test@example.com", provenance: p("e2") },
    ];
    const out = dedupeContactPoints(points);
    const phones = out.filter((c) => c.kind === "phone");
    const emails = out.filter((c) => c.kind === "email");
    expect(phones).toHaveLength(1);
    expect(emails).toHaveLength(1);
    if (phones[0]?.kind === "phone") {
      expect(phones[0].raw).toBe("+7 999 000 11 22");
    }
    expect(phones[0]?.provenance).toHaveLength(2);
    expect(emails[0]?.provenance).toHaveLength(2);
  });
});
