/**
 * contacts.* procedures — list / get360 / softDelete.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router, wrap } from "../trpc.js";

type SourceWarning = {
  code: string;
  message: string;
  section?: string;
  key?: string;
  severity: "info" | "warn" | "error";
};

function asSourceWarnings(value: unknown): SourceWarning[] {
  if (!Array.isArray(value)) return [];
  const out: SourceWarning[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    if (typeof w.code !== "string" || typeof w.message !== "string") continue;
    const severity =
      w.severity === "error" || w.severity === "warn" || w.severity === "info"
        ? w.severity
        : "info";
    out.push({
      code: w.code,
      message: w.message,
      section: typeof w.section === "string" ? w.section : undefined,
      key: typeof w.key === "string" ? w.key : undefined,
      severity,
    });
  }
  return out;
}

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

        // Enrich sourceReports with ReportImport.warnings for Sources tab (design).
        const reportIds = person.sourceReports.map((s) => s.reportId);
        if (reportIds.length === 0) return person;

        const imports = await ctx.prisma.reportImport.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, warnings: true },
        });
        const warningsById = new Map(
          imports.map((r) => [r.id, asSourceWarnings(r.warnings)]),
        );

        return {
          ...person,
          sourceReports: person.sourceReports.map((s) => ({
            ...s,
            warnings: warningsById.get(s.reportId) ?? [],
          })),
        };
      }),
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
