import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectFormat } from "../src/detectFormat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "..", "fixtures");

describe("detectFormat", () => {
  it("detects void-html from DOCTYPE + embed script", () => {
    const html = readFileSync(
      join(fixtures, "void-html", "person-basic.embed.html"),
      "utf8",
    );
    expect(detectFormat(html, "person-basic.embed.html")).toBe("void-html");
  });

  it("detects void-html from __REPORT_EMBED__ marker", () => {
    const html = readFileSync(
      join(fixtures, "void-html", "person-window-embed.html"),
      "utf8",
    );
    expect(detectFormat(html)).toBe("void-html");
  });

  it("detects sectioned-text from === headers + Key: value", () => {
    const txt = readFileSync(
      join(fixtures, "sectioned-text", "person-basic.txt"),
      "utf8",
    );
    expect(detectFormat(txt, "person-basic.txt")).toBe("sectioned-text");
  });

  it("returns unknown for free-form prose", () => {
    expect(detectFormat("hello world\nno structure here")).toBe("unknown");
  });

  it("returns unknown for empty string", () => {
    expect(detectFormat("")).toBe("unknown");
  });
});
