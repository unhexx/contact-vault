/**
 * Unit tests for ingestion validation + P2002 contentHash gate (no DB).
 */
import { contentHashOf } from "@contact-vault/domain";
import { Prisma } from "@contact-vault/db";
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import {
  isContentHashUniqueViolation,
  MAX_IMPORT_CHARS,
  UNKNOWN_FORMAT_MESSAGE,
  validateImportInput,
} from "./ingestion.js";

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

describe("UNKNOWN_FORMAT_MESSAGE (inline-dossier)", () => {
  it("lists all three accepted formats (shared with importReport)", () => {
    expect(UNKNOWN_FORMAT_MESSAGE).toContain("inline-dossier");
    expect(UNKNOWN_FORMAT_MESSAGE).toContain("void-html");
    expect(UNKNOWN_FORMAT_MESSAGE).toContain("sectioned-text");
    expect(UNKNOWN_FORMAT_MESSAGE).toBe(
      "Could not detect report format (void-html, sectioned-text, or inline-dossier required)",
    );
  });
});

describe("isContentHashUniqueViolation (Issue 1)", () => {
  function p2002(target: string | string[]): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });
  }

  it("matches contentHash target (string)", () => {
    expect(isContentHashUniqueViolation(p2002("contentHash"))).toBe(true);
  });

  it("matches contentHash in target array", () => {
    expect(isContentHashUniqueViolation(p2002(["contentHash"]))).toBe(true);
  });

  it("does not match other unique targets", () => {
    expect(
      isContentHashUniqueViolation(
        p2002(["type", "numberNorm", "personId"]),
      ),
    ).toBe(false);
    expect(
      isContentHashUniqueViolation(
        p2002(["reportImportId", "newPersonId", "targetPersonId"]),
      ),
    ).toBe(false);
    expect(
      isContentHashUniqueViolation(p2002(["personId", "reportImportId"])),
    ).toBe(false);
  });

  it("returns false for non-P2002", () => {
    expect(isContentHashUniqueViolation(new Error("x"))).toBe(false);
    expect(
      isContentHashUniqueViolation(
        new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      ),
    ).toBe(false);
  });
});
