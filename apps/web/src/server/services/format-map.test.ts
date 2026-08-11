/**
 * Unit tests for shared format-map (KD40).
 */
import { describe, expect, it } from "vitest";

import {
  dbFormatToApi,
  modeFromFormat,
  parserFormatToDb,
  type ApiReportFormat,
} from "./format-map.js";

const API_FORMATS: ApiReportFormat[] = [
  "void-html",
  "sectioned-text",
  "inline-dossier",
];

describe("parserFormatToDb", () => {
  it("maps all API formats exhaustively", () => {
    expect(parserFormatToDb("void-html")).toBe("void_html");
    expect(parserFormatToDb("sectioned-text")).toBe("sectioned_text");
    expect(parserFormatToDb("inline-dossier")).toBe("inline_dossier");
  });

  it("covers every ApiReportFormat without throw", () => {
    for (const f of API_FORMATS) {
      expect(typeof parserFormatToDb(f)).toBe("string");
    }
  });
});

describe("dbFormatToApi", () => {
  it("accepts underscore DB enum values", () => {
    expect(dbFormatToApi("void_html")).toBe("void-html");
    expect(dbFormatToApi("sectioned_text")).toBe("sectioned-text");
    expect(dbFormatToApi("inline_dossier")).toBe("inline-dossier");
  });

  it("accepts hyphen wire forms", () => {
    expect(dbFormatToApi("void-html")).toBe("void-html");
    expect(dbFormatToApi("sectioned-text")).toBe("sectioned-text");
    expect(dbFormatToApi("inline-dossier")).toBe("inline-dossier");
  });

  it("returns unknown without silent sectioned fallback", () => {
    expect(dbFormatToApi("unknown")).toBe("unknown");
    expect(dbFormatToApi("garbage")).toBe("unknown");
    expect(dbFormatToApi("")).toBe("unknown");
    expect(dbFormatToApi("sectioned")).not.toBe("sectioned-text");
  });
});

describe("modeFromFormat", () => {
  it("emits underscore domain modes (never hyphen)", () => {
    expect(modeFromFormat("void-html")).toBe("void_html");
    expect(modeFromFormat("sectioned-text")).toBe("sectioned_text");
    expect(modeFromFormat("inline-dossier")).toBe("inline_dossier");
  });

  it("never stores hyphen for inline-dossier (KD31)", () => {
    expect(modeFromFormat("inline-dossier")).not.toContain("-");
    expect(modeFromFormat("inline-dossier")).toBe("inline_dossier");
  });
});
