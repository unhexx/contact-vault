import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  documentMatchFingerprint,
  documentNumberHmac,
  DocumentNumberError,
  isDocumentNumberEnvelope,
  isDocumentNumberHmac,
  openDocumentNumber,
  parseDocumentNumberKey,
  sealDocumentNumber,
} from "../src/document-number.js";

const KEY_HEX = "ab".repeat(32);
const OTHER_HEX = "cd".repeat(32);

describe("sealDocumentNumber / openDocumentNumber", () => {
  const key = parseDocumentNumberKey(KEY_HEX)!;
  const plaintext = "4509 123456";

  it("round-trips the display number", () => {
    const sealed = sealDocumentNumber(plaintext, key);
    expect(isDocumentNumberEnvelope(sealed)).toBe(true);
    expect(openDocumentNumber(sealed, key)).toBe(plaintext);
  });

  it("does not store plaintext in the envelope", () => {
    const sealed = sealDocumentNumber(plaintext, key);
    expect(sealed).toContain('"purpose":"doc-number"');
    expect(sealed).toContain('"alg":"aes-256-gcm"');
    expect(sealed).not.toContain("4509");
    expect(sealed).not.toContain("123456");
  });

  it("uses a fresh nonce (two seals differ)", () => {
    const a = sealDocumentNumber(plaintext, key);
    const b = sealDocumentNumber(plaintext, key);
    expect(a).not.toBe(b);
    expect(openDocumentNumber(a, key)).toBe(plaintext);
    expect(openDocumentNumber(b, key)).toBe(plaintext);
  });

  it("fails closed on missing key", () => {
    const sealed = sealDocumentNumber(plaintext, key);
    try {
      openDocumentNumber(sealed, null);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentNumberError);
      expect((e as DocumentNumberError).code).toBe("MISSING_KEY");
      expect((e as Error).message).not.toContain(KEY_HEX);
      expect((e as Error).message).not.toContain(plaintext);
    }
  });

  it("fails closed on wrong key", () => {
    const sealed = sealDocumentNumber(plaintext, key);
    const other = parseDocumentNumberKey(OTHER_HEX)!;
    try {
      openDocumentNumber(sealed, other);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentNumberError);
      expect((e as DocumentNumberError).code).toBe("DECRYPT_FAILED");
      expect((e as Error).message).not.toContain(plaintext);
    }
  });

  it("fails closed on tampered ciphertext", () => {
    const sealed = sealDocumentNumber(plaintext, key);
    const json = JSON.parse(sealed) as { ct: string };
    const ct = Buffer.from(json.ct, "base64");
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    json.ct = ct.toString("base64");
    expect(() => openDocumentNumber(JSON.stringify(json), key)).toThrow(
      DocumentNumberError,
    );
  });

  it("returns leftover plaintext even when a key is present", () => {
    expect(isDocumentNumberEnvelope(plaintext)).toBe(false);
    expect(openDocumentNumber(plaintext, key)).toBe(plaintext);
    expect(openDocumentNumber(plaintext, null)).toBe(plaintext);
  });

  it("does not treat ordinary JSON as an envelope", () => {
    const other = '{"status":"ok"}';
    expect(isDocumentNumberEnvelope(other)).toBe(false);
    expect(openDocumentNumber(other, key)).toBe(other);
  });

  it("rejects a non-32-byte key on seal", () => {
    expect(() => sealDocumentNumber(plaintext, randomBytes(16))).toThrow(
      DocumentNumberError,
    );
  });
});

describe("documentNumberHmac", () => {
  const key = parseDocumentNumberKey(KEY_HEX)!;
  const other = parseDocumentNumberKey(OTHER_HEX)!;

  it("is deterministic and prefixed", () => {
    const a = documentNumberHmac("4509123456", key);
    const b = documentNumberHmac("4509123456", key);
    expect(a).toBe(b);
    expect(isDocumentNumberHmac(a)).toBe(true);
    expect(a.startsWith("h1:")).toBe(true);
  });

  it("differs across numbers and keys", () => {
    const a = documentNumberHmac("4509123456", key);
    expect(documentNumberHmac("4509123457", key)).not.toBe(a);
    expect(documentNumberHmac("4509123456", other)).not.toBe(a);
  });

  it("does not embed the numberNorm", () => {
    const mac = documentNumberHmac("4509123456", key);
    expect(mac).not.toContain("4509123456");
  });

  it("isDocumentNumberHmac rejects plaintext norms", () => {
    expect(isDocumentNumberHmac("4509123456")).toBe(false);
    expect(isDocumentNumberHmac("h1:zzzz")).toBe(false);
  });
});

describe("documentMatchFingerprint", () => {
  const key = parseDocumentNumberKey(KEY_HEX)!;

  it("HMAC-aligns leftover plaintext with stored hmac when a key is set", () => {
    const hmac = documentNumberHmac("11223344595", key);
    expect(documentMatchFingerprint("snils", hmac, key)).toBe(
      documentMatchFingerprint("snils", "11223344595", key),
    );
  });

  it("compares leftover plaintext as-is when no key", () => {
    expect(documentMatchFingerprint("snils", "11223344595", null)).toBe(
      "snils:11223344595",
    );
  });
});
