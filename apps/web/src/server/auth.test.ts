import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  parseAuthSessionSecret,
} from "@contact-vault/domain";

import {
  readCookie,
  readOperatorFromRequest,
  serializeClearSessionCookie,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
} from "./auth.js";

const SECRET = parseAuthSessionSecret("ab".repeat(32))!;

describe("session cookie helpers", () => {
  it("reads a named cookie from the header", () => {
    expect(readCookie("a=1; cv_session=tok%2Ben; b=2", SESSION_COOKIE_NAME)).toBe(
      "tok+en",
    );
    expect(readCookie("a=1", SESSION_COOKIE_NAME)).toBeNull();
  });

  it("serializes HttpOnly SameSite=Lax and clears with Max-Age=0", () => {
    const set = serializeSessionCookie("abc.def", { secure: false });
    expect(set).toContain(`${SESSION_COOKIE_NAME}=abc.def`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/");
    expect(set).not.toContain("Secure");
    const secure = serializeSessionCookie("abc.def", { secure: true });
    expect(secure).toContain("Secure");
    expect(serializeClearSessionCookie({ secure: false })).toContain("Max-Age=0");
  });

  it("reads an operator from a signed session cookie", () => {
    const tokenSet = serializeSessionCookie(createSessionToken(SECRET, "alice"), {
      secure: false,
    });
    const match = tokenSet.match(/^cv_session=([^;]+)/);
    expect(match).not.toBeNull();
    const req = new Request("http://127.0.0.1/api/trpc", {
      headers: { cookie: `cv_session=${match![1]}` },
    });
    expect(readOperatorFromRequest(req, SECRET)).toEqual({ username: "alice" });
  });
});
