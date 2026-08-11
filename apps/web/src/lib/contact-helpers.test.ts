import { describe, expect, it } from "vitest";

import {
  CONTACT_360_TABS,
  documentTypeLabel,
  formatRiskOverall,
  incidentSeverityVariant,
  isContact360Tab,
  riskOverallTone,
} from "./contact-helpers.js";

describe("contact-helpers", () => {
  it("recognizes Contact 360 tabs including risk", () => {
    expect(CONTACT_360_TABS).toContain("risk");
    for (const tab of CONTACT_360_TABS) {
      expect(isContact360Tab(tab)).toBe(true);
    }
    expect(isContact360Tab("vehicles")).toBe(false);
    expect(isContact360Tab(null)).toBe(false);
  });

  it("labels Russian document types", () => {
    expect(documentTypeLabel("passport_ru")).toBe("Passport (RU)");
    expect(documentTypeLabel("snils")).toBe("SNILS");
    expect(documentTypeLabel("inn")).toBe("INN");
  });

  it("formats and tones risk overall scores", () => {
    expect(formatRiskOverall(0.8)).toBe("0.8");
    expect(formatRiskOverall(1)).toBe("1");
    expect(formatRiskOverall(0)).toBe("0");
    expect(riskOverallTone(0.8)).toBe("destructive");
    expect(riskOverallTone(0.7)).toBe("destructive");
    expect(riskOverallTone(0.4)).toBe("warning");
    expect(riskOverallTone(0.39)).toBe("muted");
  });

  it("maps incident severity to badge variants", () => {
    expect(incidentSeverityVariant("high")).toBe("destructive");
    expect(incidentSeverityVariant("medium")).toBe("warning");
    expect(incidentSeverityVariant("low")).toBe("secondary");
  });
});
