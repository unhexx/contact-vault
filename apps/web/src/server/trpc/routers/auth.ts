/**
 * auth.* — optional local operator session (login / logout / session).
 * Public: session always; login/logout only meaningful when AUTH_ENABLED.
 */
import { verifyOperatorPassword } from "@contact-vault/domain";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { appendSessionCookie, clearSessionCookie } from "../../auth.js";
import { publicProcedure, router } from "../trpc.js";

export const authRouter = router({
  session: publicProcedure.query(({ ctx }) => ({
    enabled: ctx.env.authEnabled,
    operator: ctx.operator,
  })),

  login: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(64),
        password: z.string().min(1).max(256),
      }),
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.env.authEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Auth is not enabled",
        });
      }
      if (!ctx.env.authSessionSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Auth is misconfigured",
        });
      }
      const username = verifyOperatorPassword(
        ctx.env.authOperators,
        input.username,
        input.password,
      );
      if (!username) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }
      if (!ctx.resHeaders) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Cannot set session cookie",
        });
      }
      appendSessionCookie(ctx.resHeaders, ctx.env.authSessionSecret, username, {
        secure: ctx.env.NODE_ENV === "production",
      });
      return { username };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    if (ctx.resHeaders) {
      clearSessionCookie(ctx.resHeaders, {
        secure: ctx.env.NODE_ENV === "production",
      });
    }
    return { ok: true as const };
  }),
});
