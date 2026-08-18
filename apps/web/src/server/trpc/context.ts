/**
 * tRPC context — local composition root.
 * Optional operator session when AUTH_ENABLED (otherwise operator is "local").
 */
import {
  createAuditLogRepository,
  createMergeSuggestionRepository,
  createPersonRepository,
  createReportImportRepository,
  getPrismaClient,
  type AuditLogRepository,
  type MergeSuggestionRepository,
  type PersonRepository,
  type PrismaClient,
  type ReportImportRepository,
} from "@contact-vault/db";
import type { AuthSession } from "@contact-vault/domain";

import { readOperatorFromRequest } from "../auth.js";
import { getEnv, type Env } from "../env.js";

export type OperatorSession = AuthSession;

export type TrpcContext = {
  prisma: PrismaClient;
  personRepo: PersonRepository;
  reportImportRepo: ReportImportRepository;
  mergeSuggestionRepo: MergeSuggestionRepository;
  auditLogRepo: AuditLogRepository;
  env: Env;
  operator: OperatorSession | null;
  resHeaders: Headers | null;
};

let prismaSingleton: PrismaClient | null = null;

function resolvePrisma(databaseUrl: string): PrismaClient {
  if (prismaSingleton) return prismaSingleton;
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = databaseUrl;
  }
  // Lazy singleton shared across requests (Next.js composition root)
  prismaSingleton = getPrismaClient();
  return prismaSingleton;
}

function resolveOperator(
  env: Env,
  req: Request | undefined,
): OperatorSession | null {
  if (!env.authEnabled) return { username: "local" };
  if (!req || !env.authSessionSecret) return null;
  return readOperatorFromRequest(req, env.authSessionSecret);
}

export function createContext(opts?: {
  req?: Request;
  resHeaders?: Headers;
}): TrpcContext {
  const env = getEnv();
  const prisma = resolvePrisma(env.DATABASE_URL);
  return {
    prisma,
    personRepo: createPersonRepository(prisma, {
      documentNumberKey: env.reportBlobKey,
    }),
    reportImportRepo: createReportImportRepository(prisma),
    mergeSuggestionRepo: createMergeSuggestionRepository(prisma),
    auditLogRepo: createAuditLogRepository(prisma),
    env,
    operator: resolveOperator(env, opts?.req),
    resHeaders: opts?.resHeaders ?? null,
  };
}

/** Test helper: inject a client (e.g. per-test DB). */
export function createContextWithPrisma(
  prisma: PrismaClient,
  envOverrides?: Partial<Env>,
  extras?: {
    operator?: OperatorSession | null;
    resHeaders?: Headers;
  },
): TrpcContext {
  const env = { ...getEnv(), ...envOverrides };
  const operator =
    extras && "operator" in extras
      ? (extras.operator ?? null)
      : env.authEnabled
        ? null
        : { username: "local" };
  return {
    prisma,
    personRepo: createPersonRepository(prisma, {
      documentNumberKey: env.reportBlobKey,
    }),
    reportImportRepo: createReportImportRepository(prisma),
    mergeSuggestionRepo: createMergeSuggestionRepository(prisma),
    auditLogRepo: createAuditLogRepository(prisma),
    env,
    operator,
    resHeaders: extras?.resHeaders ?? null,
  };
}
