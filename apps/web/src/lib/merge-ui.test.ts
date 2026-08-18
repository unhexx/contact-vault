import { describe, expect, it } from "vitest";

import {
  asMatchedOn,
  entityCountEntries,
  formatMatchedOn,
  matchedFieldLabel,
  mergeDirectionLabel,
  totalEntityCount,
  type EntityCounts,
} from "./merge-ui.js";

describe("merge-ui helpers", () => {
  it("labels match fields", () => {
    expect(matchedFieldLabel("phone")).toBe("Phone");
    expect(matchedFieldLabel("email")).toBe("Email");
    expect(matchedFieldLabel("document")).toBe("Document");
    expect(matchedFieldLabel("other")).toBe("other");
  });

  it("formats matchedOn list", () => {
    expect(formatMatchedOn([])).toBe("—");
    expect(
      formatMatchedOn([
        { field: "phone", value: "+79990001122" },
        { field: "email", value: "a@example.com" },
      ]),
    ).toBe("Phone: +79990001122, Email: a@example.com");
  });

  it("guards non-array matchedOn", () => {
    expect(asMatchedOn(null)).toEqual([]);
    expect(asMatchedOn("x")).toEqual([]);
    expect(asMatchedOn([{ field: "phone", value: "+7" }])).toEqual([
      { field: "phone", value: "+7" },
    ]);
  });

  it("sums entity counts and exposes labeled entries", () => {
    const counts: EntityCounts = {
      contactPoints: 2,
      documents: 1,
      addresses: 0,
      relationships: 3,
      nameVariants: 1,
      personSourceReports: 2,
      riskScores: 2,
      incidents: 3,
    };
    expect(totalEntityCount(counts)).toBe(14);
    const entries = entityCountEntries(counts);
    expect(entries).toHaveLength(8);
    expect(entries.find((e) => e.key === "personSourceReports")?.label).toBe(
      "Source reports",
    );
    expect(entries.find((e) => e.key === "riskScores")?.label).toBe(
      "Risk scores",
    );
    expect(entries.find((e) => e.key === "incidents")?.label).toBe("Incidents");
  });

  it("documents fixed merge direction", () => {
    expect(mergeDirectionLabel()).toContain("→");
    expect(mergeDirectionLabel().toLowerCase()).toContain("survivor");
  });
});
