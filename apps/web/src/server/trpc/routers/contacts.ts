/**
 * contacts.* procedures — list / get360 / timeline / softDelete.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { listPersonTimeline } from "../../services/timeline.js";
import { publicProcedure, router, wrap } from "../trpc.js";

export const contactsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          q: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(20),
          cursor: z.string().optional(),
        })
        .default({ limit: 20 }),
    )
    .query(({ ctx, input }) =>
      wrap(async () => {
        const result = await ctx.personRepo.list({
          q: input.q,
          limit: input.limit,
          cursor: input.cursor,
        });
        return result;
      }),
    ),

  get360: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      wrap(async () => {
        const person = await ctx.personRepo.get360(input.id);
        if (!person) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Person not found",
          });
        }
        return person;
      }),
    ),

  timeline: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(({ ctx, input }) =>
      wrap(async () => listPersonTimeline(ctx.prisma, input.id, input.limit)),
    ),

  softDelete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      wrap(async () => {
        // Idempotent soft-delete in repository
        await ctx.personRepo.softDelete(input.id);
        return { ok: true as const };
      }),
    ),
});
