/**
 * tRPC context — single-user local composition root (no auth).
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

import { getEnv, type Env } from "../env.js";

export type TrpcContext = {
  prisma: PrismaClient;
  personRepo: PersonRepository;
  reportImportRepo: ReportImportRepository;
  mergeSuggestionRepo: MergeSuggestionRepository;
  auditLogRepo: AuditLogRepository;
  env: Env;
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

export function createContext(): TrpcContext {
  const env = getEnv();
  const prisma = resolvePrisma(env.DATABASE_URL);
  return {
    prisma,
    personRepo: createPersonRepository(prisma),
    reportImportRepo: createReportImportRepository(prisma),
    mergeSuggestionRepo: createMergeSuggestionRepository(prisma),
    auditLogRepo: createAuditLogRepository(prisma),
    env,
  };
}

/** Test helper: inject a client (e.g. per-test DB). */
export function createContextWithPrisma(
  prisma: PrismaClient,
  envOverrides?: Partial<Env>,
): TrpcContext {
  const env = { ...getEnv(), ...envOverrides };
  return {
    prisma,
    personRepo: createPersonRepository(prisma),
    reportImportRepo: createReportImportRepository(prisma),
    mergeSuggestionRepo: createMergeSuggestionRepository(prisma),
    auditLogRepo: createAuditLogRepository(prisma),
    env,
  };
}
