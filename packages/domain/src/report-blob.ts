import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

/** AES-256-GCM envelope written to data/reports/{id}.bin when a key is set. */
export const REPORT_BLOB_ALG = "aes-256-gcm" as const;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export const ReportBlobEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal(REPORT_BLOB_ALG),
  nonce: z.string().min(1),
  ct: z.string(),
  tag: z.string().min(1),
});

export type ReportBlobEnvelope = z.infer<typeof ReportBlobEnvelopeSchema>;

export type ReportBlobErrorCode =
  | "INVALID_KEY"
  | "MISSING_KEY"
  | "DECRYPT_FAILED";

export class ReportBlobError extends Error {
  readonly code: ReportBlobErrorCode;

  constructor(code: ReportBlobErrorCode, message: string) {
    super(message);
    this.name = "ReportBlobError";
    this.code = code;
  }
}

/**
 * Env-only AES-256 key. Empty / unset → null (plaintext write).
 * Never log the returned bytes or the raw env value.
 */
export function parseReportBlobKey(
  raw: string | undefined | null,
): Buffer | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s.length === 0) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) {
    throw new ReportBlobError(
      "INVALID_KEY",
      "REPORT_BLOB_KEY must be 64 hex characters (32-byte AES-256 key)",
    );
  }
  return Buffer.from(s, "hex");
}

export function isReportBlobEnvelope(bytes: Uint8Array): boolean {
  return parseEnvelope(Buffer.from(bytes)) !== null;
}

function parseEnvelope(buf: Buffer): ReportBlobEnvelope | null {
  let text = buf.toString("utf8");
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const parsed = ReportBlobEnvelopeSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Seal UTF-8 report text. Does not hash; contentHash stays on plaintext. */
export function sealReportBlob(plaintext: string, key: Buffer): Buffer {
  if (key.length !== KEY_BYTES) {
    throw new ReportBlobError(
      "INVALID_KEY",
      "REPORT_BLOB_KEY must be 32 bytes",
    );
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(REPORT_BLOB_ALG, key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: ReportBlobEnvelope = {
    v: 1,
    alg: REPORT_BLOB_ALG,
    nonce: nonce.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

/**
 * Open a stored blob. Legacy plaintext (no envelope) is returned as UTF-8.
 * Envelope + missing/wrong key fails closed — never return ciphertext as text.
 */
export function openReportBlob(
  bytes: Uint8Array,
  key: Buffer | null,
): string {
  const buf = Buffer.from(bytes);
  const envelope = parseEnvelope(buf);
  if (!envelope) {
    return buf.toString("utf8");
  }
  if (!key) {
    throw new ReportBlobError(
      "MISSING_KEY",
      "Encrypted report blob requires REPORT_BLOB_KEY",
    );
  }
  if (key.length !== KEY_BYTES) {
    throw new ReportBlobError(
      "INVALID_KEY",
      "REPORT_BLOB_KEY must be 32 bytes",
    );
  }
  try {
    const nonce = Buffer.from(envelope.nonce, "base64");
    const ct = Buffer.from(envelope.ct, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("bad envelope field lengths");
    }
    const decipher = createDecipheriv(REPORT_BLOB_ALG, key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch (err) {
    if (err instanceof ReportBlobError) throw err;
    throw new ReportBlobError(
      "DECRYPT_FAILED",
      "Failed to decrypt report blob (wrong key or corrupt envelope)",
    );
  }
}
