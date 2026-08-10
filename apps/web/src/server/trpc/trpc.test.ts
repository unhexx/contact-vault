/**
 * Unit tests for tRPC error mapping (ZodError → BAD_REQUEST).
 */
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toTrpcError } from "./trpc.js";

describe("toTrpcError", () => {
  it("maps ZodError to BAD_REQUEST", () => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: "nope" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    try {
      toTrpcError(parsed.error);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("BAD_REQUEST");
    }
  });
});
