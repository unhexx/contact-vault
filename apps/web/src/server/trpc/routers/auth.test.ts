/**
 * auth.* + operatorProcedure: session required only when AUTH_ENABLED.
 */
import {
  parseAuthOperators,
  parseAuthSessionSecret,
} from "@contact-vault/domain";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { Env } from "../../env.js";
import type { TrpcContext } from "../context.js";
import { operatorProcedure, router } from "../trpc.js";
import { appRouter } from "../router.js";

const SECRET = parseAuthSessionSecret("ab".repeat(32))!;
const OPERATORS = parseAuthOperators("alice:correct-horse");

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgresql://contactvault:contactvault@localhost:5432/contactvault",
    NODE_ENV: "test",
    STORE_RAW_REPORTS: false,
    reportBlobKey: null,
    authEnabled: false,
    authSessionSecret: null,
    authOperators: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    prisma: {} as TrpcContext["prisma"],
    personRepo: {} as TrpcContext["personRepo"],
    reportImportRepo: {} as TrpcContext["reportImportRepo"],
    mergeSuggestionRepo: {} as TrpcContext["mergeSuggestionRepo"],
    auditLogRepo: {} as TrpcContext["auditLogRepo"],
    env: baseEnv(),
    operator: { username: "local" },
    resHeaders: new Headers(),
    ...overrides,
  };
}

const pingRouter = router({
  ping: operatorProcedure.query(() => "ok" as const),
});

describe("operatorProcedure", () => {
  it("allows anonymous access when auth is off", async () => {
    const caller = pingRouter.createCaller(
      ctx({ env: baseEnv({ authEnabled: false }), operator: null }),
    );
    await expect(caller.ping()).resolves.toBe("ok");
  });

  it("rejects missing session when auth is on", async () => {
    const caller = pingRouter.createCaller(
      ctx({
        env: baseEnv({
          authEnabled: true,
          authSessionSecret: SECRET,
          authOperators: OPERATORS,
        }),
        operator: null,
      }),
    );
    try {
      await caller.ping();
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("allows a signed-in operator when auth is on", async () => {
    const caller = pingRouter.createCaller(
      ctx({
        env: baseEnv({
          authEnabled: true,
          authSessionSecret: SECRET,
          authOperators: OPERATORS,
        }),
        operator: { username: "alice" },
      }),
    );
    await expect(caller.ping()).resolves.toBe("ok");
  });
});

describe("auth router", () => {
  it("session reports disabled + local operator by default", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(caller.auth.session()).resolves.toEqual({
      enabled: false,
      operator: { username: "local" },
    });
  });

  it("login fails closed when auth is off", async () => {
    const caller = appRouter.createCaller(ctx());
    try {
      await caller.auth.login({
        username: "alice",
        password: "correct-horse",
      });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("login sets a session cookie and rejects bad passwords", async () => {
    const resHeaders = new Headers();
    const enabled = ctx({
      env: baseEnv({
        authEnabled: true,
        authSessionSecret: SECRET,
        authOperators: OPERATORS,
      }),
      operator: null,
      resHeaders,
    });
    const caller = appRouter.createCaller(enabled);
    try {
      await caller.auth.login({ username: "alice", password: "wrong-password" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("UNAUTHORIZED");
      expect((e as TRPCError).message).not.toContain("wrong-password");
    }
    await expect(
      caller.auth.login({ username: "alice", password: "correct-horse" }),
    ).resolves.toEqual({ username: "alice" });
    const setCookie = resHeaders.get("set-cookie");
    expect(setCookie).toMatch(/cv_session=/);
    expect(setCookie).toContain("HttpOnly");
  });

  it("logout clears the session cookie", async () => {
    const resHeaders = new Headers();
    const caller = appRouter.createCaller(ctx({ resHeaders }));
    await expect(caller.auth.logout()).resolves.toEqual({ ok: true });
    expect(resHeaders.get("set-cookie")).toContain("Max-Age=0");
  });
});
