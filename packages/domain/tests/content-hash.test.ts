import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentHashOf, normalizeReportContent } from "../src/content-hash.js";

describe("normalizeReportContent", () => {
  it("strips UTF-8 BOM", () => {
    expect(normalizeReportContent("\uFEFFhello")).toBe("hello");
  });

  it("normalizes CRLF and lone CR to LF", () => {
    expect(normalizeReportContent("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });

  it("does not trim significant interior or trailing spaces", () => {
    expect(normalizeReportContent("  keep  ")).toBe("  keep  ");
  });
});

describe("contentHashOf", () => {
  it("is stable for CRLF vs LF (same logical content)", () => {
    const lf = "line1\nline2\nline3";
    const crlf = "line1\r\nline2\r\nline3";
    expect(contentHashOf(lf)).toBe(contentHashOf(crlf));
  });

  it("is stable for BOM vs no BOM", () => {
    const plain = "report body\n";
    const bom = `\uFEFF${plain}`;
    expect(contentHashOf(plain)).toBe(contentHashOf(bom));
  });

  it("is stable for BOM + CRLF combination", () => {
    const a = "\uFEFFalpha\r\nbeta\r";
    const b = "alpha\nbeta\n";
    expect(contentHashOf(a)).toBe(contentHashOf(b));
  });

  it("returns sha256 hex of normalized UTF-8 bytes", () => {
    const content = "hello\r\nworld";
    const expected = createHash("sha256")
      .update("hello\nworld", "utf8")
      .digest("hex");
    expect(contentHashOf(content)).toBe(expected);
    expect(contentHashOf(content)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when logical content differs", () => {
    expect(contentHashOf("a")).not.toBe(contentHashOf("b"));
  });
});
