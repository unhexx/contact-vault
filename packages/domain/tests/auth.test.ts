import { describe, expect, it } from "vitest";

import {
  AuthError,
  createSessionToken,
  parseAuthOperators,
  parseAuthSessionSecret,
  resolveAuthConfig,
  verifyOperatorPassword,
  verifySessionToken,
} from "../src/auth.js";

const SECRET_HEX = "ab".repeat(32);
const OTHER_HEX = "cd".repeat(32);

describe("parseAuthSessionSecret", () => {
  it("returns null for unset or blank", () => {
    expect(parseAuthSessionSecret(undefined)).toBeNull();
    expect(parseAuthSessionSecret(null)).toBeNull();
    expect(parseAuthSessionSecret("")).toBeNull();
    expect(parseAuthSessionSecret("   ")).toBeNull();
  });

  it("accepts 64 hex chars", () => {
    const key = parseAuthSessionSecret(SECRET_HEX);
    expect(key?.length).toBe(32);
    expect(key?.equals(Buffer.from(SECRET_HEX, "hex"))).toBe(true);
  });

  it("rejects invalid hex without echoing the value", () => {
    try {
      parseAuthSessionSecret("not-a-secret");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).code).toBe("INVALID_SECRET");
      expect((e as Error).message).not.toContain("not-a-secret");
    }
  });
});

describe("parseAuthOperators", () => {
  it("returns empty for unset or blank", () => {
    expect(parseAuthOperators(undefined)).toEqual([]);
    expect(parseAuthOperators("")).toEqual([]);
  });

  it("parses one or more user:password pairs", () => {
    expect(parseAuthOperators("alice:correct-horse")).toEqual([
      { username: "alice", password: "correct-horse" },
    ]);
    expect(
      parseAuthOperators("alice:correct-horse,bob:battery-staple"),
    ).toEqual([
      { username: "alice", password: "correct-horse" },
      { username: "bob", password: "battery-staple" },
    ]);
  });

  it("allows colons in the password", () => {
    expect(parseAuthOperators("alice:ab:cd:efgh")).toEqual([
      { username: "alice", password: "ab:cd:efgh" },
    ]);
  });

  it("rejects short passwords without echoing them", () => {
    try {
      parseAuthOperators("alice:short");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).code).toBe("INVALID_OPERATORS");
      expect((e as Error).message).not.toContain("short");
    }
  });

  it("rejects duplicate usernames", () => {
    expect(() =>
      parseAuthOperators("alice:correct-horse,alice:other-pass"),
    ).toThrow(/unique/);
  });
});

describe("resolveAuthConfig", () => {
  it("allows auth off with no secret or operators", () => {
    const cfg = resolveAuthConfig({ enabled: false });
    expect(cfg.enabled).toBe(false);
    expect(cfg.sessionSecret).toBeNull();
    expect(cfg.operators).toEqual([]);
  });

  it("fails closed when enabled without secret", () => {
    expect(() =>
      resolveAuthConfig({
        enabled: true,
        operators: "alice:correct-horse",
      }),
    ).toThrow(/AUTH_SESSION_SECRET/);
  });

  it("fails closed when enabled without operators", () => {
    expect(() =>
      resolveAuthConfig({
        enabled: true,
        sessionSecret: SECRET_HEX,
      }),
    ).toThrow(/AUTH_OPERATORS/);
  });

  it("accepts enabled with secret + operators", () => {
    const cfg = resolveAuthConfig({
      enabled: true,
      sessionSecret: SECRET_HEX,
      operators: "alice:correct-horse",
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.operators).toHaveLength(1);
    expect(cfg.sessionSecret?.length).toBe(32);
  });
});

describe("verifyOperatorPassword", () => {
  const ops = parseAuthOperators("alice:correct-horse,bob:battery-staple");

  it("returns the stored username on match", () => {
    expect(verifyOperatorPassword(ops, "alice", "correct-horse")).toBe("alice");
    expect(verifyOperatorPassword(ops, "bob", "battery-staple")).toBe("bob");
  });

  it("returns null for unknown user or wrong password", () => {
    expect(verifyOperatorPassword(ops, "carol", "correct-horse")).toBeNull();
    expect(verifyOperatorPassword(ops, "alice", "wrong-password")).toBeNull();
    expect(verifyOperatorPassword([], "alice", "correct-horse")).toBeNull();
  });
});

describe("createSessionToken / verifySessionToken", () => {
  const secret = parseAuthSessionSecret(SECRET_HEX)!;
  const other = parseAuthSessionSecret(OTHER_HEX)!;

  it("round-trips a username", () => {
    const token = createSessionToken(secret, "alice");
    expect(verifySessionToken(secret, token)).toEqual({ username: "alice" });
  });

  it("rejects a tampered token, wrong secret, or expiry", () => {
    const token = createSessionToken(secret, "alice");
    expect(verifySessionToken(other, token)).toBeNull();
    expect(verifySessionToken(secret, token.slice(0, -2) + "aa")).toBeNull();
    expect(verifySessionToken(secret, "not-a-token")).toBeNull();
    const expired = createSessionToken(secret, "alice", {
      nowMs: Date.now() - 20_000,
      ttlSeconds: 1,
    });
    expect(verifySessionToken(secret, expired)).toBeNull();
  });
});
