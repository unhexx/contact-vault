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
  listOpen(params?: {
    personId?: string;
    limit?: number;
  }): Promise<MergeSuggestion[]>;
  dismiss(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
  /**
   * Accept only if still open and neither party is soft-deleted.
   * Returns null when not open / missing / deleted parties (BAD_REQUEST at tRPC).
   */
  accept(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
  findById(id: string, tx?: DbClient): Promise<MergeSuggestion | null>;
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

/**
 * Reject accept when either person is soft-deleted (design merge.accept rule).
 * Returns false if either missing or deleted.
 */
async function bothPersonsActive(
  c: DbClient,
  newPersonId: string,
  targetPersonId: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([
    c.person.findFirst({
      where: { id: newPersonId, deletedAt: null },
      select: { id: true },
    }),
    c.person.findFirst({
      where: { id: targetPersonId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  return Boolean(a && b);
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

      const active = await bothPersonsActive(
        c,
        existing.newPersonId,
        existing.targetPersonId,
      );
      if (!active) {
        // Soft-deleted party — do not accept (design soft-delete table)
        return null;
      }

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
