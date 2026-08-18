import { afterEach, describe, expect, it } from "vitest";

import { getEnv, resetEnvCache } from "./env.js";

const ORIG_DB = process.env.DATABASE_URL;
const ORIG_KEY = process.env.REPORT_BLOB_KEY;
const ORIG_STORE = process.env.STORE_RAW_REPORTS;

describe("getEnv REPORT_BLOB_KEY", () => {
  afterEach(() => {
    resetEnvCache();
    if (ORIG_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIG_DB;
    if (ORIG_KEY === undefined) delete process.env.REPORT_BLOB_KEY;
    else process.env.REPORT_BLOB_KEY = ORIG_KEY;
    if (ORIG_STORE === undefined) delete process.env.STORE_RAW_REPORTS;
    else process.env.STORE_RAW_REPORTS = ORIG_STORE;
  });

  it("parses unset key as null", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    delete process.env.REPORT_BLOB_KEY;
    resetEnvCache();
    expect(getEnv().reportBlobKey).toBeNull();
    expect(getEnv().STORE_RAW_REPORTS).toBe(false);
  });

  it("parses 64-hex key without exposing it on thrown paths", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    process.env.REPORT_BLOB_KEY = "ab".repeat(32);
    resetEnvCache();
    const key = getEnv().reportBlobKey;
    expect(key?.equals(Buffer.from("ab".repeat(32), "hex"))).toBe(true);
  });

  it("fails closed on invalid key", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    process.env.REPORT_BLOB_KEY = "not-a-key";
    resetEnvCache();
    expect(() => getEnv()).toThrow(/64 hex characters/);
  });
});
