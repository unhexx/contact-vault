import { describe, expect, it } from "vitest";

import {
  CONTACT_360_TABS,
  documentTypeLabel,
  isContact360Tab,
} from "./contact-helpers.js";

describe("contact-helpers", () => {
  it("recognizes Contact 360 tabs", () => {
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
});
