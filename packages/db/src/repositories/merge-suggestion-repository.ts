import type { MergeSuggestion, PrismaClient } from "@prisma/client";
import { DbError } from "../errors.js";
import type {
  CreateMergeSuggestionInput,
  DbClient,
  MatchedOnJson,
} from "../types.js";

export type MergeSuggestionRow = MergeSuggestion & {
  matchedOn: MatchedOnJson;
};

export type MergeSuggestionListParams = {
  personId?: string;
  status?: string;
  limit?: number;
};

export type MergeSuggestionRepository = {
  create(
    input: CreateMergeSuggestionInput,
    tx?: DbClient,
  ): Promise<MergeSuggestion>;
  /**
   * Insert many suggestions. When `tx` is omitted, wraps in an interactive
   * transaction so partial writes cannot occur mid-batch.
   */
  createMany(
    inputs: CreateMergeSuggestionInput[],
    tx?: DbClient,
  ): Promise<MergeSuggestion[]>;
  findById(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
  list(params?: MergeSuggestionListParams): Promise<MergeSuggestion[]>;
  setStatus(
    id: string,
    status: "open" | "accepted" | "dismissed",
    tx?: DbClient,
  ): Promise<MergeSuggestion>;
};

function assertNotSelf(input: CreateMergeSuggestionInput): void {
  if (input.newPersonId === input.targetPersonId) {
    throw new DbError(
      "SELF_SUGGESTION",
      "newPersonId must not equal targetPersonId (no self-suggestion)",
    );
  }
}

async function insertOne(
  c: DbClient,
  input: CreateMergeSuggestionInput,
): Promise<MergeSuggestion> {
  assertNotSelf(input);
  return c.mergeSuggestion.create({
    data: {
      reportImportId: input.reportImportId,
      newPersonId: input.newPersonId,
      targetPersonId: input.targetPersonId,
      matchedOn: input.matchedOn,
      status: "open",
    },
  });
}

export function createMergeSuggestionRepository(
  client: PrismaClient | DbClient,
): MergeSuggestionRepository {
  const root = client as PrismaClient;

  return {
    async create(input, tx) {
      return insertOne(tx ?? root, input);
    },

    async createMany(inputs, tx) {
      const run = async (c: DbClient) => {
        const results: MergeSuggestion[] = [];
        for (const input of inputs) {
          results.push(await insertOne(c, input));
        }
        return results;
      };

      if (tx) {
        return run(tx);
      }
      // Atomic batch when no outer tx provided (Issue 7)
      return root.$transaction(async (inner) => run(inner));
    },

    async findById(id, tx) {
      const c = tx ?? root;
      return c.mergeSuggestion.findUnique({ where: { id } });
    },

    async list(params) {
      const limit = params?.limit ?? 50;
      const personId = params?.personId;
      return root.mergeSuggestion.findMany({
        where: {
          ...(params?.status ? { status: params.status } : {}),
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

    async setStatus(id, status, tx) {
      const c = tx ?? root;
      return c.mergeSuggestion.update({
        where: { id },
        data: {
          status,
          resolvedAt: status === "open" ? null : new Date(),
        },
      });
    },
  };
}
