/**
 * Server-component session read (vault layout + login page).
 */
import { cookies } from "next/headers";
import { verifySessionToken, type AuthSession } from "@contact-vault/domain";

import { SESSION_COOKIE_NAME } from "./auth.js";
import { getEnv } from "./env.js";

export type ServerSession = {
  enabled: boolean;
  operator: AuthSession | null;
};

export async function getServerSession(): Promise<ServerSession> {
  const env = getEnv();
  if (!env.authEnabled) {
    return { enabled: false, operator: { username: "local" } };
  }
  if (!env.authSessionSecret) {
    return { enabled: true, operator: null };
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { enabled: true, operator: null };
  return {
    enabled: true,
    operator: verifySessionToken(env.authSessionSecret, token),
  };
}
