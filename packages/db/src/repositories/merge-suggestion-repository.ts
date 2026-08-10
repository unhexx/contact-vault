import type { MergeSuggestion, PrismaClient } from "@prisma/client";
import type {
  CreateMergeSuggestionInput,
  DbClient,
  MatchedOnJson,
} from "../types.js";

export type MergeSuggestionRow = MergeSuggestion & {
  matchedOn: MatchedOnJson;
};

export type MergeSuggestionRepository = {
  create(
    input: CreateMergeSuggestionInput,
    tx?: DbClient,
  ): Promise<MergeSuggestion>;
  createMany(
    inputs: CreateMergeSuggestionInput[],
    tx?: DbClient,
  ): Promise<MergeSuggestion[]>;
  listOpen(params?: {
    personId?: string;
    limit?: number;
  }): Promise<MergeSuggestion[]>;
  dismiss(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
  accept(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
  findById(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
};

export function createMergeSuggestionRepository(
  client: PrismaClient | DbClient,
): MergeSuggestionRepository {
  const root = client as PrismaClient;

  return {
    async create(input, tx) {
      if (input.newPersonId === input.targetPersonId) {
        throw new Error(
          "newPersonId must not equal targetPersonId (no self-suggestion)",
        );
      }
      const c = tx ?? root;
      return c.mergeSuggestion.create({
        data: {
          reportImportId: input.reportImportId,
          newPersonId: input.newPersonId,
          targetPersonId: input.targetPersonId,
          matchedOn: input.matchedOn,
          status: "open",
        },
      });
    },

    async createMany(inputs, tx) {
      const c = tx ?? root;
      const results: MergeSuggestion[] = [];
      for (const input of inputs) {
        if (input.newPersonId === input.targetPersonId) {
          throw new Error(
            "newPersonId must not equal targetPersonId (no self-suggestion)",
          );
        }
        results.push(
          await c.mergeSuggestion.create({
            data: {
              reportImportId: input.reportImportId,
              newPersonId: input.newPersonId,
              targetPersonId: input.targetPersonId,
              matchedOn: input.matchedOn,
              status: "open",
            },
          }),
        );
      }
      return results;
    },

    async listOpen(params) {
      const limit = params?.limit ?? 50;
      const personId = params?.personId;
      return root.mergeSuggestion.findMany({
        where: {
          status: "open",
          ...(personId
            ? {
                OR: [{ newPersonId: personId }, { targetPersonId: personId }],
              }
            : {}),
          newPerson: { deletedAt: null },
          targetPerson: { deletedAt: null },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    },

    async dismiss(id, tx) {
      const c = tx ?? root;
      const existing = await c.mergeSuggestion.findUnique({ where: { id } });
      if (!existing || existing.status !== "open") return null;
      return c.mergeSuggestion.update({
        where: { id },
        data: { status: "dismissed", resolvedAt: new Date() },
      });
    },

    async accept(id, tx) {
      const c = tx ?? root;
      const existing = await c.mergeSuggestion.findUnique({ where: { id } });
      if (!existing || existing.status !== "open") return null;
      return c.mergeSuggestion.update({
        where: { id },
        data: { status: "accepted", resolvedAt: new Date() },
      });
    },

    async findById(id, tx) {
      const c = tx ?? root;
      return c.mergeSuggestion.findUnique({ where: { id } });
    },
  };
}
