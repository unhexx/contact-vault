/**
 * Optional local operator login (v0.5). Not multi-tenant, not OAuth.
 * Operators live in env (AUTH_OPERATORS); session is an HMAC-signed token.
 * Never log passwords, secrets, or raw tokens.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const AUTH_SESSION_VERSION = "v1" as const;

const SECRET_BYTES = 32;
const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 256;

export type AuthErrorCode =
  | "INVALID_SECRET"
  | "INVALID_OPERATORS"
  | "AUTH_MISCONFIGURED";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export type AuthOperator = {
  username: string;
  password: string;
};

export type AuthSession = {
  username: string;
};

export type AuthConfig = {
  enabled: boolean;
  sessionSecret: Buffer | null;
  operators: readonly AuthOperator[];
};

/**
 * Env-only HMAC key. Empty / unset → null (auth off or not yet configured).
 * Never log the returned bytes or the raw env value.
 */
export function parseAuthSessionSecret(
  raw: string | undefined | null,
): Buffer | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s.length === 0) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) {
    throw new AuthError(
      "INVALID_SECRET",
      "AUTH_SESSION_SECRET must be 64 hex characters (32-byte key)",
    );
  }
  return Buffer.from(s, "hex");
}

/**
 * `user:password,user2:password2`. First colon splits username / password
 * so passwords may contain colons. Never include pair text in errors.
 */
export function parseAuthOperators(
  raw: string | undefined | null,
): AuthOperator[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  const operators: AuthOperator[] = [];
  const seen = new Set<string>();
  for (const part of trimmed.split(",")) {
    const entry = part.trim();
    if (entry.length === 0) continue;
    const colon = entry.indexOf(":");
    if (colon <= 0) {
      throw new AuthError(
        "INVALID_OPERATORS",
        "AUTH_OPERATORS entries must be user:password",
      );
    }
    const username = entry.slice(0, colon).trim();
    const password = entry.slice(colon + 1).trim();
    if (!USERNAME_RE.test(username)) {
      throw new AuthError(
        "INVALID_OPERATORS",
        "AUTH_OPERATORS username must be 1–64 letters, digits, dot, underscore, or hyphen",
      );
    }
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new AuthError(
        "INVALID_OPERATORS",
        "AUTH_OPERATORS password must be 8–256 characters",
      );
    }
    if (seen.has(username)) {
      throw new AuthError(
        "INVALID_OPERATORS",
        "AUTH_OPERATORS usernames must be unique",
      );
    }
    seen.add(username);
    operators.push({ username, password });
  }
  return operators;
}

/** Fail closed when auth is on without a secret or at least one operator. */
export function resolveAuthConfig(input: {
  enabled: boolean;
  sessionSecret?: string | null;
  operators?: string | null;
}): AuthConfig {
  const sessionSecret = parseAuthSessionSecret(input.sessionSecret);
  const operators = parseAuthOperators(input.operators);
  if (input.enabled) {
    if (!sessionSecret) {
      throw new AuthError(
        "AUTH_MISCONFIGURED",
        "AUTH_ENABLED requires AUTH_SESSION_SECRET (64 hex characters)",
      );
    }
    if (operators.length === 0) {
      throw new AuthError(
        "AUTH_MISCONFIGURED",
        "AUTH_ENABLED requires AUTH_OPERATORS (user:password[,user:password])",
      );
    }
  }
  return { enabled: input.enabled, sessionSecret, operators };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Returns the stored username on match, otherwise null.
 * Does not distinguish unknown user vs wrong password.
 */
export function verifyOperatorPassword(
  operators: readonly AuthOperator[],
  username: string,
  password: string,
): string | null {
  const u = username.trim();
  const p = password;
  if (u.length === 0 || p.length === 0 || operators.length === 0) return null;

  let found: AuthOperator | undefined;
  for (const op of operators) {
    if (timingSafeStringEqual(op.username, u)) found = op;
  }
  const against = found ?? operators[0];
  if (!against) return null;
  const passwordOk = timingSafeStringEqual(against.password, p);
  if (!found || !passwordOk) return null;
  return found.username;
}

function requireSecret(secret: Buffer): void {
  if (secret.length !== SECRET_BYTES) {
    throw new AuthError(
      "INVALID_SECRET",
      "Auth session secret must be 32 bytes",
    );
  }
}

function hmacB64(secret: Buffer, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  secret: Buffer,
  username: string,
  opts?: { nowMs?: number; ttlSeconds?: number },
): string {
  requireSecret(secret);
  const u = username.trim();
  if (!USERNAME_RE.test(u)) {
    throw new AuthError(
      "INVALID_OPERATORS",
      "Session username must be 1–64 letters, digits, dot, underscore, or hyphen",
    );
  }
  const nowMs = opts?.nowMs ?? Date.now();
  const ttl = opts?.ttlSeconds ?? AUTH_SESSION_TTL_SECONDS;
  const iat = Math.floor(nowMs / 1000);
  const payload = Buffer.from(
    JSON.stringify({ v: 1, u, iat, exp: iat + ttl }),
    "utf8",
  ).toString("base64url");
  const body = `${AUTH_SESSION_VERSION}.${payload}`;
  return `${body}.${hmacB64(secret, body)}`;
}

export function verifySessionToken(
  secret: Buffer,
  token: string,
  opts?: { nowMs?: number },
): AuthSession | null {
  if (secret.length !== SECRET_BYTES) return null;
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [ver, payloadB64, sig] = parts;
  if (ver !== AUTH_SESSION_VERSION || !payloadB64 || !sig) return null;
  const body = `${ver}.${payloadB64}`;
  const expected = hmacB64(secret, body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    payload == null ||
    typeof payload !== "object" ||
    (payload as { v?: unknown }).v !== 1
  ) {
    return null;
  }
  const u = (payload as { u?: unknown }).u;
  const exp = (payload as { exp?: unknown }).exp;
  if (typeof u !== "string" || !USERNAME_RE.test(u)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  const nowSec = Math.floor((opts?.nowMs ?? Date.now()) / 1000);
  if (exp < nowSec) return null;
  return { username: u };
}
