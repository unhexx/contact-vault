import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client. Prefer injecting via createPersonRepository(db) etc.
 * Lazy singleton for simple scripts / Next.js composition root.
 */
const globalForPrisma = globalThis as unknown as {
  __contactVaultPrisma?: PrismaClient;
};

export function createPrismaClient(
  datasourceUrl?: string,
): PrismaClient {
  return new PrismaClient(
    datasourceUrl
      ? {
          datasources: {
            db: { url: datasourceUrl },
          },
        }
      : undefined,
  );
}

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.__contactVaultPrisma) {
    globalForPrisma.__contactVaultPrisma = createPrismaClient();
  }
  return globalForPrisma.__contactVaultPrisma;
}

export type { PrismaClient };
