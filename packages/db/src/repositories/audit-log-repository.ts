import type { AuditLog, Prisma, PrismaClient } from "@prisma/client";
import type { CreateAuditLogInput, DbClient } from "../types.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export type AuditLogRepository = {
  append(input: CreateAuditLogInput, tx?: DbClient): Promise<AuditLog>;
  listForEntity(
    entityType: string,
    entityId: string,
    limit?: number,
  ): Promise<AuditLog[]>;
};

export function createAuditLogRepository(
  client: PrismaClient | DbClient,
): AuditLogRepository {
  const root = client as PrismaClient;

  return {
    async append(input, tx) {
      const c = tx ?? root;
      return c.auditLog.create({
        data: {
          action: input.action,
          actor: input.actor ?? "local",
          entityType: input.entityType,
          entityId: input.entityId,
          payload: input.payload != null ? toJson(input.payload) : undefined,
        },
      });
    },

    async listForEntity(entityType, entityId, limit = 50) {
      return root.auditLog.findMany({
        where: { entityType, entityId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    },
  };
}
