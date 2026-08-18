/**
 * HTTP session cookie for optional local operator login.
 * Token create/verify lives in @contact-vault/domain; this file is cookie I/O.
 */
import {
  AUTH_SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
  type AuthSession,
} from "@contact-vault/domain";

export const SESSION_COOKIE_NAME = "cv_session";

const COOKIE_PATH = "/";

export function readCookie(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function readOperatorFromRequest(
  req: Request,
  secret: Buffer,
): AuthSession | null {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) return null;
  return verifySessionToken(secret, token);
}

export function serializeSessionCookie(
  token: string,
  opts: { secure: boolean; maxAgeSeconds?: number },
): string {
  const maxAge = opts.maxAgeSeconds ?? AUTH_SESSION_TTL_SECONDS;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearSessionCookie(opts: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function appendSessionCookie(
  headers: Headers,
  secret: Buffer,
  username: string,
  opts: { secure: boolean },
): void {
  const token = createSessionToken(secret, username);
  headers.append("Set-Cookie", serializeSessionCookie(token, opts));
}

export function clearSessionCookie(
  headers: Headers,
  opts: { secure: boolean },
): void {
  headers.append("Set-Cookie", serializeClearSessionCookie(opts));
}
