import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  isReportBlobEnvelope,
  parseReportBlobKey,
} from "@contact-vault/domain";
import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import {
  encodeRawReportBody,
  readRawReportFile,
  writeRawReportFile,
} from "./report-blob-store.js";

const KEY = parseReportBlobKey("11".repeat(32))!;

describe("encodeRawReportBody", () => {
  it("writes plaintext when key is absent", () => {
    const buf = encodeRawReportBody("hello", null);
    expect(buf.toString("utf8")).toBe("hello");
    expect(isReportBlobEnvelope(buf)).toBe(false);
  });

  it("writes an envelope when key is set", () => {
    const buf = encodeRawReportBody("secret-body", KEY);
    expect(isReportBlobEnvelope(buf)).toBe(true);
    expect(buf.toString("utf8")).not.toContain("secret-body");
  });
});

describe("writeRawReportFile / readRawReportFile", () => {
  let root = "";

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("round-trips an encrypted file", async () => {
    root = await mkdtemp(path.join(tmpdir(), "cv-store-"));
    const rel = path.join("data", "reports", "id.bin");
    await writeRawReportFile(root, rel, "body-текст", KEY);
    const onDisk = await readFile(path.join(root, rel));
    expect(isReportBlobEnvelope(onDisk)).toBe(true);
    expect(await readRawReportFile(root, rel, KEY)).toBe("body-текст");
  });

  it("maps decrypt failure to AppError without leaking body", async () => {
    root = await mkdtemp(path.join(tmpdir(), "cv-store-"));
    const rel = path.join("data", "reports", "id.bin");
    await writeRawReportFile(root, rel, "hidden-body", KEY);
    try {
      await readRawReportFile(root, rel, null);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).appCode).toBe("REPORT_BLOB_DECRYPT_FAILED");
      expect((e as Error).message).not.toContain("hidden-body");
    }
  });
});
