/**
 * reports.* procedures — import / get.
 */
import { z } from "zod";

import { AppError } from "../../errors.js";
import { dbFormatToApi } from "../../services/format-map.js";
import { importReport } from "../../services/ingestion.js";
import { publicProcedure, router, wrap } from "../trpc.js";

export const reportsRouter = router({
  import: publicProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        content: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      wrap(async () =>
        importReport(
          {
            prisma: ctx.prisma,
            storeRawReports: ctx.env.STORE_RAW_REPORTS,
          },
          input,
        ),
      ),
    ),

  get: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      wrap(async () => {
        const row = await ctx.reportImportRepo.findById(input.id);
        if (!row) {
          throw new AppError("NOT_FOUND", "Report import not found");
        }
        return {
          id: row.id,
          format: dbFormatToApi(row.format),
          status: row.status,
          filename: row.filename,
          contentHash: row.contentHash,
          reportQuery: row.reportQuery,
          byteSize: row.byteSize,
          warnings: row.warnings,
          errorMessage: row.errorMessage,
          rawStorage: row.rawStorage,
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
        };
      }),
    ),
});
