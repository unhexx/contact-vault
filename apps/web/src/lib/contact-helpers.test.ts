import { describe, expect, it } from "vitest";

import {
  CONTACT_360_TABS,
  documentTypeLabel,
  formatRiskOverall,
  incidentSeverityVariant,
  isContact360Tab,
  pickHighestRiskScore,
  riskOverallTone,
  roundRiskOverall,
  timelineActionLabel,
  timelineActionVariant,
} from "./contact-helpers.js";

describe("contact-helpers", () => {
  it("recognizes Contact 360 tabs including risk and timeline", () => {
    expect(CONTACT_360_TABS).toContain("risk");
    expect(CONTACT_360_TABS).toContain("banks");
    expect(CONTACT_360_TABS).toContain("assets");
    expect(CONTACT_360_TABS).toContain("work");
    expect(CONTACT_360_TABS).toContain("timeline");
    for (const tab of CONTACT_360_TABS) {
      expect(isContact360Tab(tab)).toBe(true);
    }
    expect(isContact360Tab("vehicles")).toBe(false);
    expect(isContact360Tab(null)).toBe(false);
  });

  it("labels timeline actions", () => {
    expect(timelineActionLabel("import")).toBe("Import");
    expect(timelineActionLabel("merge")).toBe("Merge");
    expect(timelineActionLabel("dismiss")).toBe("Dismiss");
    expect(timelineActionVariant("merge")).toBe("default");
    expect(timelineActionVariant("soft_delete")).toBe("destructive");
  });

  it("labels Russian document types", () => {
    expect(documentTypeLabel("passport_ru")).toBe("Passport (RU)");
    expect(documentTypeLabel("snils")).toBe("SNILS");
    expect(documentTypeLabel("inn")).toBe("INN");
  });

  it("formats and tones risk overall scores consistently", () => {
    expect(formatRiskOverall(0.8)).toBe("0.8");
    expect(formatRiskOverall(1)).toBe("1");
    expect(formatRiskOverall(0)).toBe("0");
    expect(riskOverallTone(0.8)).toBe("destructive");
    expect(riskOverallTone(0.7)).toBe("destructive");
    expect(riskOverallTone(0.4)).toBe("warning");
    expect(riskOverallTone(0.39)).toBe("muted");
    // Display + tone share two-decimal rounding (review Issue 2)
    expect(roundRiskOverall(0.699)).toBe(0.7);
    expect(formatRiskOverall(0.699)).toBe("0.7");
    expect(riskOverallTone(0.699)).toBe("destructive");
    expect(formatRiskOverall(0.394)).toBe("0.39");
    expect(riskOverallTone(0.394)).toBe("muted");
  });

  it("picks highest overall risk score with stable first-max tie-break", () => {
    expect(pickHighestRiskScore([])).toBeUndefined();
    expect(pickHighestRiskScore([{ overall: 0.3 }, { overall: 0.9 }, { overall: 0.5 }])?.overall).toBe(
      0.9,
    );
    const tied = pickHighestRiskScore([
      { overall: 0.8, id: "a" },
      { overall: 0.8, id: "b" },
    ]);
    expect(tied?.id).toBe("a");
  });

  it("maps incident severity to badge variants", () => {
    expect(incidentSeverityVariant("high")).toBe("destructive");
    expect(incidentSeverityVariant("medium")).toBe("warning");
    expect(incidentSeverityVariant("low")).toBe("secondary");
  });
});
