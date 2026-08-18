import { describe, expect, it } from "vitest";
import {
  dbFormatToParser,
  formatToSourceMode,
  normalizeSourceMode,
  parserFormatToDb,
} from "../src/format.js";

describe("format converters", () => {
  it("maps parser hyphenated names to Prisma snake_case", () => {
    expect(parserFormatToDb("void-html")).toBe("void_html");
    expect(parserFormatToDb("sectioned-text")).toBe("sectioned_text");
    expect(parserFormatToDb("inline-dossier")).toBe("inline_dossier");
    expect(parserFormatToDb("unknown")).toBe("unknown");
  });

  it("keeps unknown formats unknown (never sectioned-text)", () => {
    expect(parserFormatToDb("something-else")).toBe("unknown");
    expect(dbFormatToParser("something-else")).toBe("unknown");
  });

  it("maps Prisma names back to parser names", () => {
    expect(dbFormatToParser("void_html")).toBe("void-html");
    expect(dbFormatToParser("sectioned_text")).toBe("sectioned-text");
    expect(dbFormatToParser("inline_dossier")).toBe("inline-dossier");
    expect(dbFormatToParser("unknown")).toBe("unknown");
    expect(dbFormatToParser("void-html")).toBe("void-html");
  });

  it("maps formats to domain source mode", () => {
    expect(formatToSourceMode("void-html")).toBe("void_html");
    expect(formatToSourceMode("sectioned-text")).toBe("text_export");
    expect(formatToSourceMode("sectioned_text")).toBe("text_export");
    expect(formatToSourceMode("inline-dossier")).toBe("inline_dossier");
    expect(formatToSourceMode("unknown")).toBe("other");
  });

  it("normalizes PersonSourceReport.mode aliases", () => {
    expect(normalizeSourceMode("sectioned_text")).toBe("text_export");
    expect(normalizeSourceMode("void-html")).toBe("void_html");
    expect(normalizeSourceMode("telegram")).toBe("telegram");
    expect(normalizeSourceMode(null)).toBeUndefined();
    expect(normalizeSourceMode("nope")).toBe("other");
  });
});
