import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getEnv, resetEnvCache } from "./env.js";

const ORIG_DB = process.env.DATABASE_URL;
const ORIG_KEY = process.env.REPORT_BLOB_KEY;
const ORIG_STORE = process.env.STORE_RAW_REPORTS;
const ORIG_AUTH = process.env.AUTH_ENABLED;
const ORIG_AUTH_SECRET = process.env.AUTH_SESSION_SECRET;
const ORIG_AUTH_OPS = process.env.AUTH_OPERATORS;

function restoreEnv(): void {
  resetEnvCache();
  if (ORIG_DB === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIG_DB;
  if (ORIG_KEY === undefined) delete process.env.REPORT_BLOB_KEY;
  else process.env.REPORT_BLOB_KEY = ORIG_KEY;
  if (ORIG_STORE === undefined) delete process.env.STORE_RAW_REPORTS;
  else process.env.STORE_RAW_REPORTS = ORIG_STORE;
  if (ORIG_AUTH === undefined) delete process.env.AUTH_ENABLED;
  else process.env.AUTH_ENABLED = ORIG_AUTH;
  if (ORIG_AUTH_SECRET === undefined) delete process.env.AUTH_SESSION_SECRET;
  else process.env.AUTH_SESSION_SECRET = ORIG_AUTH_SECRET;
  if (ORIG_AUTH_OPS === undefined) delete process.env.AUTH_OPERATORS;
  else process.env.AUTH_OPERATORS = ORIG_AUTH_OPS;
}

beforeEach(() => {
  process.env.DATABASE_URL =
    "postgresql://contactvault:contactvault@localhost:5432/contactvault";
  delete process.env.AUTH_ENABLED;
  delete process.env.AUTH_SESSION_SECRET;
  delete process.env.AUTH_OPERATORS;
  resetEnvCache();
});

describe("getEnv REPORT_BLOB_KEY", () => {
  afterEach(restoreEnv);

  it("parses unset key as null", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    delete process.env.REPORT_BLOB_KEY;
    resetEnvCache();
    expect(getEnv().reportBlobKey).toBeNull();
    expect(getEnv().STORE_RAW_REPORTS).toBe(false);
    expect(getEnv().authEnabled).toBe(false);
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

describe("getEnv AUTH_*", () => {
  afterEach(restoreEnv);

  it("defaults auth off without operators", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    delete process.env.AUTH_ENABLED;
    delete process.env.AUTH_SESSION_SECRET;
    delete process.env.AUTH_OPERATORS;
    resetEnvCache();
    const env = getEnv();
    expect(env.authEnabled).toBe(false);
    expect(env.authSessionSecret).toBeNull();
    expect(env.authOperators).toEqual([]);
  });

  it("fails closed when AUTH_ENABLED without secret or operators", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    process.env.AUTH_ENABLED = "true";
    delete process.env.AUTH_SESSION_SECRET;
    process.env.AUTH_OPERATORS = "alice:correct-horse";
    resetEnvCache();
    expect(() => getEnv()).toThrow(/AUTH_SESSION_SECRET/);

    process.env.AUTH_SESSION_SECRET = "ab".repeat(32);
    delete process.env.AUTH_OPERATORS;
    resetEnvCache();
    expect(() => getEnv()).toThrow(/AUTH_OPERATORS/);
  });

  it("loads operators when enabled with secret", () => {
    process.env.DATABASE_URL =
      "postgresql://contactvault:contactvault@localhost:5432/contactvault";
    process.env.AUTH_ENABLED = "true";
    process.env.AUTH_SESSION_SECRET = "ab".repeat(32);
    process.env.AUTH_OPERATORS = "alice:correct-horse,bob:battery-staple";
    resetEnvCache();
    const env = getEnv();
    expect(env.authEnabled).toBe(true);
    expect(env.authOperators.map((o) => o.username)).toEqual(["alice", "bob"]);
    expect(env.authSessionSecret?.length).toBe(32);
  });
});
