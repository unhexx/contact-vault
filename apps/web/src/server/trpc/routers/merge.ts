/**
 * merge.* procedures — listSuggestions / preview / accept / dismiss / undo.
 * Accept always merges newPersonId → targetPersonId (KD18).
 * Dismiss = keep both (no separate keep_separate strategy).
 * Undo = restore a merge from its audit event, including collision path (no UI yet).
 */
import { z } from "zod";

import { AppError } from "../../errors.js";
import {
  dismissSuggestion,
  listSuggestions,
  mergePersons,
  previewMerge,
  undoMerge,
} from "../../services/merge.js";
import { publicProcedure, router, wrap } from "../trpc.js";

export const mergeRouter = router({
  listSuggestions: publicProcedure
    .input(
      z
        .object({
          personId: z.string().uuid().optional(),
          status: z.enum(["open", "accepted", "dismissed"]).optional(),
        })
        .default({}),
    )
    .query(({ ctx, input }) =>
      wrap(async () =>
        listSuggestions(ctx.prisma, {
          personId: input.personId,
          status: input.status,
        }),
      ),
    ),

  preview: publicProcedure
    .input(z.object({ suggestionId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      wrap(async () => previewMerge(ctx.prisma, input.suggestionId)),
    ),

  accept: publicProcedure
    .input(z.object({ suggestionId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      wrap(async () => {
        const suggestion = await ctx.mergeSuggestionRepo.findById(
          input.suggestionId,
        );
        if (!suggestion) {
          throw new AppError("NOT_FOUND", "Merge suggestion not found");
        }
        if (suggestion.status !== "open") {
          throw new AppError("BAD_REQUEST", "Merge suggestion is not open");
        }
        // Always new → target
        return mergePersons(ctx.prisma, {
          sourcePersonId: suggestion.newPersonId,
          targetPersonId: suggestion.targetPersonId,
          suggestionId: suggestion.id,
        });
      }),
    ),

  dismiss: publicProcedure
    .input(z.object({ suggestionId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      wrap(async () => dismissSuggestion(ctx.prisma, input.suggestionId)),
    ),

  undo: publicProcedure
    .input(z.object({ auditEventId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      wrap(async () => undoMerge(ctx.prisma, input.auditEventId)),
    ),
});
