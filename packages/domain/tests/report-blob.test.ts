import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { contentHashOf } from "../src/content-hash.js";
import {
  isReportBlobEnvelope,
  openReportBlob,
  parseReportBlobKey,
  ReportBlobError,
  sealReportBlob,
} from "../src/report-blob.js";

const KEY_HEX = "ab".repeat(32);
const OTHER_HEX = "cd".repeat(32);

describe("parseReportBlobKey", () => {
  it("returns null for unset or blank", () => {
    expect(parseReportBlobKey(undefined)).toBeNull();
    expect(parseReportBlobKey(null)).toBeNull();
    expect(parseReportBlobKey("")).toBeNull();
    expect(parseReportBlobKey("   ")).toBeNull();
  });

  it("accepts 64 hex chars (case-insensitive)", () => {
    const lower = parseReportBlobKey(KEY_HEX);
    const upper = parseReportBlobKey(KEY_HEX.toUpperCase());
    expect(lower).toBeInstanceOf(Buffer);
    expect(lower?.length).toBe(32);
    expect(upper?.equals(lower!)).toBe(true);
  });

  it("rejects non-hex and wrong length", () => {
    expect(() => parseReportBlobKey("short")).toThrow(ReportBlobError);
    expect(() => parseReportBlobKey("zz".repeat(32))).toThrow(ReportBlobError);
    expect(() => parseReportBlobKey("ab".repeat(16))).toThrow(ReportBlobError);
    try {
      parseReportBlobKey("not-a-key");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ReportBlobError);
      expect((e as ReportBlobError).code).toBe("INVALID_KEY");
      expect((e as Error).message).not.toContain("not-a-key");
    }
  });
});

describe("sealReportBlob / openReportBlob", () => {
  const key = parseReportBlobKey(KEY_HEX)!;
  const plaintext = "ФИО: Тестов\r\nпаспорт 1234 567890\n";

  it("round-trips UTF-8 report text", () => {
    const sealed = sealReportBlob(plaintext, key);
    expect(isReportBlobEnvelope(sealed)).toBe(true);
    expect(openReportBlob(sealed, key)).toBe(plaintext);
  });

  it("does not store plaintext in the envelope", () => {
    const sealed = sealReportBlob(plaintext, key);
    const asText = sealed.toString("utf8");
    expect(asText).toContain('"alg":"aes-256-gcm"');
    expect(asText).not.toContain("Тестов");
    expect(asText).not.toContain("1234 567890");
    expect(sealed.includes(Buffer.from(plaintext, "utf8"))).toBe(false);
  });

  it("uses a fresh nonce (two seals differ)", () => {
    const a = sealReportBlob(plaintext, key);
    const b = sealReportBlob(plaintext, key);
    expect(a.equals(b)).toBe(false);
    expect(openReportBlob(a, key)).toBe(plaintext);
    expect(openReportBlob(b, key)).toBe(plaintext);
  });

  it("fails closed on missing key", () => {
    const sealed = sealReportBlob(plaintext, key);
    try {
      openReportBlob(sealed, null);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ReportBlobError);
      expect((e as ReportBlobError).code).toBe("MISSING_KEY");
      expect((e as Error).message).not.toContain(KEY_HEX);
      expect((e as Error).message).not.toContain("Тестов");
    }
  });

  it("fails closed on wrong key", () => {
    const sealed = sealReportBlob(plaintext, key);
    const other = parseReportBlobKey(OTHER_HEX)!;
    try {
      openReportBlob(sealed, other);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ReportBlobError);
      expect((e as ReportBlobError).code).toBe("DECRYPT_FAILED");
      expect((e as Error).message).not.toContain("Тестов");
    }
  });

  it("fails closed on tampered ciphertext", () => {
    const sealed = sealReportBlob(plaintext, key);
    const json = JSON.parse(sealed.toString("utf8")) as { ct: string };
    const ct = Buffer.from(json.ct, "base64");
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    json.ct = ct.toString("base64");
    const tampered = Buffer.from(JSON.stringify(json), "utf8");
    expect(() => openReportBlob(tampered, key)).toThrow(ReportBlobError);
    try {
      openReportBlob(tampered, key);
    } catch (e) {
      expect((e as ReportBlobError).code).toBe("DECRYPT_FAILED");
    }
  });

  it("returns legacy plaintext even when a key is present", () => {
    const legacy = Buffer.from(plaintext, "utf8");
    expect(isReportBlobEnvelope(legacy)).toBe(false);
    expect(openReportBlob(legacy, key)).toBe(plaintext);
    expect(openReportBlob(legacy, null)).toBe(plaintext);
  });

  it("does not treat ordinary JSON reports as envelopes", () => {
    const report = '{"status":"ok","data":{"banks":[]}}';
    expect(isReportBlobEnvelope(Buffer.from(report, "utf8"))).toBe(false);
    expect(openReportBlob(Buffer.from(report, "utf8"), key)).toBe(report);
  });

  it("contentHash stays on plaintext, not the envelope", () => {
    const sealed = sealReportBlob(plaintext, key);
    expect(contentHashOf(plaintext)).not.toBe(
      contentHashOf(sealed.toString("utf8")),
    );
    expect(contentHashOf(plaintext)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a non-32-byte key on seal", () => {
    expect(() => sealReportBlob(plaintext, randomBytes(16))).toThrow(
      ReportBlobError,
    );
  });
});
