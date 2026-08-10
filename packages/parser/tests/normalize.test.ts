import { describe, expect, it } from "vitest";
import {
  mapDocumentType,
  normalizeDate,
  normalizePhone,
  parseFio,
} from "../src/normalize/index.js";

describe("normalizePhone", () => {
  it("normalizes +7 spaced RU mobile", () => {
    const r = normalizePhone("+7 900 000-00-01");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe("+79000000001");
  });

  it("normalizes 8-prefix RU mobile", () => {
    const r = normalizePhone("89000000001");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe("+79000000001");
  });

  it("normalizes bare 10-digit national", () => {
    const r = normalizePhone("9000000001");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe("+79000000001");
  });

  it("returns raw-only for unparseable (PHONE_UNNORMALIZED path)", () => {
    const r = normalizePhone("not-a-phone");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raw).toBe("not-a-phone");
  });
});

describe("parseFio", () => {
  it("splits 3-token Russian FIO", () => {
    const n = parseFio("Тестов Тест Тестович");
    expect(n).toEqual({
      full: "Тестов Тест Тестович",
      last: "Тестов",
      first: "Тест",
      middle: "Тестович",
    });
  });

  it("keeps full for 2-token name", () => {
    const n = parseFio("Тестов Тест");
    expect(n.full).toBe("Тестов Тест");
    expect(n.last).toBe("Тестов");
    expect(n.first).toBe("Тест");
    expect(n.middle).toBeUndefined();
  });
});

describe("normalizeDate", () => {
  it("parses DD.MM.YYYY → ISO", () => {
    expect(normalizeDate("15.01.1990")).toBe("1990-01-15");
  });

  it("parses ISO date", () => {
    expect(normalizeDate("1990-01-15")).toBe("1990-01-15");
  });

  it("parses MM.YYYY", () => {
    expect(normalizeDate("06.2015")).toBe("2015-06");
  });

  it("parses year only", () => {
    expect(normalizeDate("1990")).toBe("1990");
  });
});

describe("mapDocumentType", () => {
  it("maps passport → passport_ru", () => {
    expect(mapDocumentType("passport")).toBe("passport_ru");
  });

  it("maps snils", () => {
    expect(mapDocumentType("snils")).toBe("snils");
    expect(mapDocumentType("СНИЛС")).toBe("snils");
  });
});
