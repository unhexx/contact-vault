import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  detectFormat,
  DETECT_SAMPLE_WINDOW,
  INLINE_IMYA_MIN_ALONE,
  INLINE_IMYA_MIN_WITH_KEYS,
  INLINE_KEY_MIN,
  SECTIONED_LINE_KV_RATIO,
} from "../src/detectFormat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "..", "fixtures");

function load(...parts: string[]): string {
  return readFileSync(join(fixtures, ...parts), "utf8");
}

describe("detectFormat KD37 constants", () => {
  it("exports locked thresholds", () => {
    expect(SECTIONED_LINE_KV_RATIO).toBe(0.5);
    expect(DETECT_SAMPLE_WINDOW).toBe(8192);
    expect(INLINE_IMYA_MIN_ALONE).toBe(2);
    expect(INLINE_IMYA_MIN_WITH_KEYS).toBe(1);
    expect(INLINE_KEY_MIN).toBe(4);
  });
});

describe("detectFormat table-driven", () => {
  const cases: Array<{
    name: string;
    content: string;
    filename?: string;
    expected: string;
  }> = [
    {
      name: "1. person-basic sectioned → sectioned-text",
      content: load("sectioned-text", "person-basic.txt"),
      filename: "person-basic.txt",
      expected: "sectioned-text",
    },
    {
      name: "2. clean Имя: sectioned → sectioned-text (KD41)",
      content: load("sectioned-text", "clean-imya-sectioned.txt"),
      filename: "clean-imya-sectioned.txt",
      expected: "sectioned-text",
    },
    {
      name: "3. person-scoring-basic → inline-dossier",
      content: load("inline-dossier", "person-scoring-basic.txt"),
      filename: "person-scoring-basic.txt",
      expected: "inline-dossier",
    },
    {
      name: "4. dense-inline-no-scoring → inline-dossier",
      content: load("inline-dossier", "dense-inline-no-scoring.txt"),
      filename: "dense-inline-no-scoring.txt",
      expected: "inline-dossier",
    },
    {
      name: "5. scoring-only → inline-dossier",
      content: load("inline-dossier", "scoring-only.txt"),
      filename: "scoring-only.txt",
      expected: "inline-dossier",
    },
    {
      name: "6. ====Доходы====-only .txt → unknown (weak path removed)",
      content: load("inline-dossier", "dohody-only.txt"),
      filename: "dohody-only.txt",
      expected: "unknown",
    },
    {
      name: "7. empty string → unknown",
      content: "",
      expected: "unknown",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(detectFormat(c.content, c.filename)).toBe(c.expected);
    });
  }
});

describe("detectFormat void-html regression", () => {
  it("detects void-html from DOCTYPE + embed script", () => {
    const html = load("void-html", "person-basic.embed.html");
    expect(detectFormat(html, "person-basic.embed.html")).toBe("void-html");
  });

  it("detects void-html from __REPORT_EMBED__ marker", () => {
    const html = load("void-html", "person-window-embed.html");
    expect(detectFormat(html)).toBe("void-html");
  });

  it("returns unknown for free-form prose", () => {
    expect(detectFormat("hello world\nno structure here")).toBe("unknown");
  });

  it("does not steal clean sectioned via density (KD41 inline)", () => {
    // Explicit multi-key-free line-oriented Имя + many keys must stay sectioned
    const clean = `=== Источник ===
Имя: Тестов Тест
Телефон: +79001112233
Email: a@b.c
Дата рождения: 01.01.1990
Паспорт: 11 11 111111
СНИЛС: 000-000-000 00
ИНН: 123456789012
`;
    expect(detectFormat(clean, "clean.txt")).toBe("sectioned-text");
  });

  it("no weak .txt + header-only fallback (KD25)", () => {
    const onlyHeader = "=== Some Source ===\n\nfree prose without KV lines\n";
    expect(detectFormat(onlyHeader, "sparse.txt")).toBe("unknown");
  });
});
