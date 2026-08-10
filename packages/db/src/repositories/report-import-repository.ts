import type {
  Prisma,
  PrismaClient,
  ReportFormat,
  ReportImport,
  ReportImportStatus,
} from "@prisma/client";
import type {
  CreateReportImportInput,
  DbClient,
  ReportImportStatusDb,
} from "../types.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export type ReportImportRepository = {
  create(input: CreateReportImportInput, tx?: DbClient): Promise<ReportImport>;
  findByContentHash(
    contentHash: string,
    tx?: DbClient,
  ): Promise<ReportImport | null>;
  findById(id: string, tx?: DbClient): Promise<ReportImport | null>;
  updateStatus(
    id: string,
    data: {
      status: ReportImportStatusDb;
      completedAt?: Date | null;
      errorMessage?: string | null;
      warnings?: unknown;
    },
    tx?: DbClient,
  ): Promise<ReportImport>;
};

export function createReportImportRepository(
  client: PrismaClient | DbClient,
): ReportImportRepository {
  const root = client as PrismaClient;

  return {
    async create(input, tx) {
      const c = tx ?? root;
      return c.reportImport.create({
        data: {
          id: input.id,
          format: input.format as ReportFormat,
          contentHash: input.contentHash,
          filename: input.filename ?? null,
          reportQuery: input.reportQuery ?? null,
          byteSize: input.byteSize ?? null,
          warnings: input.warnings != null ? toJson(input.warnings) : undefined,
          status: (input.status ?? "pending") as ReportImportStatus,
          rawStorage: input.rawStorage ?? null,
        },
      });
    },

    async findByContentHash(contentHash, tx) {
      const c = tx ?? root;
      return c.reportImport.findUnique({ where: { contentHash } });
    },

    async findById(id, tx) {
      const c = tx ?? root;
      return c.reportImport.findUnique({ where: { id } });
    },

    async updateStatus(id, data, tx) {
      const c = tx ?? root;
      return c.reportImport.update({
        where: { id },
        data: {
          status: data.status as ReportImportStatus,
          completedAt: data.completedAt === undefined ? undefined : data.completedAt,
          errorMessage:
            data.errorMessage === undefined ? undefined : data.errorMessage,
          warnings:
            data.warnings === undefined ? undefined : toJson(data.warnings),
        },
      });
    },
  };
}
