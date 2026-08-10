/**
 * Unit tests for ingestion validation + pure helpers (no DB).
 */
import { contentHashOf } from "@contact-vault/domain";
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { MAX_IMPORT_CHARS, validateImportInput } from "./ingestion.js";

describe("validateImportInput", () => {
  it("accepts .html .htm .txt (case-insensitive)", () => {
    expect(() =>
      validateImportInput({ filename: "a.html", content: "x" }),
    ).not.toThrow();
    expect(() =>
      validateImportInput({ filename: "a.HTM", content: "x" }),
    ).not.toThrow();
    expect(() =>
      validateImportInput({ filename: "report.TXT", content: "x" }),
    ).not.toThrow();
  });

  it("rejects invalid filename extension", () => {
    try {
      validateImportInput({ filename: "report.pdf", content: "x" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).appCode).toBe("INVALID_FILENAME");
      expect((e as AppError).code).toBe("BAD_REQUEST");
    }
  });

  it("rejects content over MAX_IMPORT_CHARS", () => {
    const content = "a".repeat(MAX_IMPORT_CHARS + 1);
    try {
      validateImportInput({ filename: "big.txt", content });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).appCode).toBe("IMPORT_TOO_LARGE");
    }
  });
});

describe("contentHashOf (KD13 authority for ingestion)", () => {
  it("is stable for CRLF vs LF", () => {
    const a = "line1\r\nline2\r\n";
    const b = "line1\nline2\n";
    expect(contentHashOf(a)).toBe(contentHashOf(b));
  });
});
