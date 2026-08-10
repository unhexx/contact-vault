/**
 * merge.* procedures — listSuggestions / preview / accept / dismiss / execute.
 * Accept always merges newPersonId → targetPersonId (KD18).
 * Dismiss = keep both (no separate keep_separate strategy).
 */
import { z } from "zod";

import { AppError } from "../../errors.js";
import {
  dismissSuggestion,
  listSuggestions,
  mergePersons,
  previewMerge,
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

  execute: publicProcedure
    .input(
      z.object({
        sourcePersonId: z.string().uuid(),
        targetPersonId: z.string().uuid(),
      }),
    )
    .mutation(({ ctx, input }) =>
      wrap(async () =>
        mergePersons(ctx.prisma, {
          sourcePersonId: input.sourcePersonId,
          targetPersonId: input.targetPersonId,
        }),
      ),
    ),
});
