import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

import { parseReportBlobKey } from "./report-blob.js";

/** AES-256-GCM envelope stored in IdentityDocument.number when a key is set. */
export const DOCUMENT_NUMBER_ALG = "aes-256-gcm" as const;
export const DOCUMENT_NUMBER_PURPOSE = "doc-number" as const;
/** Prefix so HMAC numberNorm cannot be confused with a leftover plaintext norm. */
export const DOCUMENT_NUMBER_HMAC_PREFIX = "h1:" as const;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HMAC_CONTEXT = "cv.doc.n1|";

export const DocumentNumberEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal(DOCUMENT_NUMBER_ALG),
  purpose: z.literal(DOCUMENT_NUMBER_PURPOSE),
  nonce: z.string().min(1),
  ct: z.string(),
  tag: z.string().min(1),
});

export type DocumentNumberEnvelope = z.infer<
  typeof DocumentNumberEnvelopeSchema
>;

export type DocumentNumberErrorCode =
  | "INVALID_KEY"
  | "MISSING_KEY"
  | "DECRYPT_FAILED";

export class DocumentNumberError extends Error {
  readonly code: DocumentNumberErrorCode;

  constructor(code: DocumentNumberErrorCode, message: string) {
    super(message);
    this.name = "DocumentNumberError";
    this.code = code;
  }
}

/** Same 64-hex AES-256 env key as report blobs (REPORT_BLOB_KEY). */
export const parseDocumentNumberKey = parseReportBlobKey;

function requireKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new DocumentNumberError(
      "INVALID_KEY",
      "Document-number key must be 32 bytes",
    );
  }
}

function parseEnvelope(stored: string): DocumentNumberEnvelope | null {
  const trimmed = stored.trim();
  if (!trimmed.startsWith("{")) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const parsed = DocumentNumberEnvelopeSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function isDocumentNumberEnvelope(stored: string): boolean {
  return parseEnvelope(stored) !== null;
}

export function isDocumentNumberHmac(value: string): boolean {
  return /^h1:[0-9a-f]{64}$/.test(value);
}

/**
 * Deterministic HMAC-SHA256 of numberNorm (blind index).
 * Domain-separated so it is not a raw HMAC of unrelated bytes under the same key.
 */
export function documentNumberHmac(numberNorm: string, key: Buffer): string {
  requireKey(key);
  const mac = createHmac("sha256", key)
    .update(HMAC_CONTEXT)
    .update(numberNorm, "utf8")
    .digest("hex");
  return `${DOCUMENT_NUMBER_HMAC_PREFIX}${mac}`;
}

/**
 * Collision / lookup fingerprint. HMAC plaintext norms when a key is set
 * so mixed leftover-plaintext + ciphertext rows still compare.
 */
export function documentMatchFingerprint(
  type: string,
  numberNorm: string,
  key: Buffer | null,
): string {
  if (!key || isDocumentNumberHmac(numberNorm)) {
    return `${type}:${numberNorm}`;
  }
  return `${type}:${documentNumberHmac(numberNorm, key)}`;
}

/** Seal the display document number. Does not HMAC; caller stores that separately. */
export function sealDocumentNumber(plaintext: string, key: Buffer): string {
  requireKey(key);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(DOCUMENT_NUMBER_ALG, key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: DocumentNumberEnvelope = {
    v: 1,
    alg: DOCUMENT_NUMBER_ALG,
    purpose: DOCUMENT_NUMBER_PURPOSE,
    nonce: nonce.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
  return JSON.stringify(envelope);
}

/**
 * Open a stored document number.
 * Legacy plaintext (no envelope) is returned as-is.
 * Envelope + missing/wrong key fails closed — never return ciphertext as the number.
 */
export function openDocumentNumber(
  stored: string,
  key: Buffer | null,
): string {
  const envelope = parseEnvelope(stored);
  if (!envelope) return stored;
  if (!key) {
    throw new DocumentNumberError(
      "MISSING_KEY",
      "Encrypted document number requires REPORT_BLOB_KEY",
    );
  }
  requireKey(key);
  try {
    const nonce = Buffer.from(envelope.nonce, "base64");
    const ct = Buffer.from(envelope.ct, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("bad envelope field lengths");
    }
    const decipher = createDecipheriv(DOCUMENT_NUMBER_ALG, key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch (err) {
    if (err instanceof DocumentNumberError) throw err;
    throw new DocumentNumberError(
      "DECRYPT_FAILED",
      "Failed to decrypt document number (wrong key or corrupt envelope)",
    );
  }
}
