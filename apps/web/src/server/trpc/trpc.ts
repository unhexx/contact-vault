/**
 * tRPC init + error mapping for AppError / CursorError / DbError.
 */
import { CursorError, isDbError } from "@contact-vault/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { isAppError } from "../errors.js";
import type { TrpcContext } from "./context.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const appCode =
      isAppError(cause) && cause.appCode
        ? cause.appCode
        : isAppError(error) && error.appCode
          ? error.appCode
          : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        appCode,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Map known domain/app errors into TRPCError. */
export function toTrpcError(err: unknown): never {
  if (err instanceof TRPCError) throw err;

  if (isAppError(err)) {
    const code =
      err.code === "BAD_REQUEST"
        ? "BAD_REQUEST"
        : err.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : err.code === "CONFLICT"
            ? "CONFLICT"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: err.message, cause: err });
  }

  if (err instanceof CursorError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: err.message,
      cause: err,
    });
  }

  if (isDbError(err)) {
    const code =
      err.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : err.code === "CONFLICT"
          ? "CONFLICT"
          : "BAD_REQUEST";
    throw new TRPCError({ code, message: err.message, cause: err });
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: err instanceof Error ? err.message : "Internal server error",
    cause: err,
  });
}

/** Wrap async handler so AppError/etc. become TRPCError. */
export function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err: unknown) => toTrpcError(err));
}
