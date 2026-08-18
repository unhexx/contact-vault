/**
 * Optional raw report body on disk (KD14).
 * STORE_RAW_REPORTS=false → no file.
 * STORE_RAW_REPORTS=true without key → plaintext (residual risk).
 * STORE_RAW_REPORTS=true with key → AES-256-GCM envelope at the same path.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  openReportBlob,
  ReportBlobError,
  sealReportBlob,
} from "@contact-vault/domain";

import { AppError } from "../errors.js";

export function encodeRawReportBody(
  content: string,
  key: Buffer | null,
): Buffer {
  if (!key) return Buffer.from(content, "utf8");
  return sealReportBlob(content, key);
}

export async function writeRawReportFile(
  dataRoot: string,
  relPath: string,
  content: string,
  key: Buffer | null,
): Promise<void> {
  const abs = path.join(dataRoot, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, encodeRawReportBody(content, key));
}

export async function readRawReportFile(
  dataRoot: string,
  relPath: string,
  key: Buffer | null,
): Promise<string> {
  const abs = path.join(dataRoot, relPath);
  const bytes = await readFile(abs);
  try {
    return openReportBlob(bytes, key);
  } catch (err) {
    const message =
      err instanceof ReportBlobError
        ? err.message
        : "Failed to read report blob";
    throw new AppError("INTERNAL", message, "REPORT_BLOB_DECRYPT_FAILED");
  }
}
