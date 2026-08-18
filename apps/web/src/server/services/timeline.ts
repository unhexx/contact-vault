/**
 * Person import timeline: PersonSourceReport / ReportImport + Person audit_log.
 * Append-only assembly — no rewrite or collapse.
 */
import {
  createAuditLogRepository,
  dbFormatToParser,
  type PrismaClient,
} from "@contact-vault/db";
import {
  mergePersonTimeline,
  type TimelineEvent,
} from "@contact-vault/domain";

import { AppError } from "../errors.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function listPersonTimeline(
  prisma: PrismaClient,
  personId: string,
  limit = DEFAULT_LIMIT,
): Promise<TimelineEvent[]> {
  const take = Math.min(Math.max(limit, 1), MAX_LIMIT);

  const person = await prisma.person.findFirst({
    where: { id: personId, deletedAt: null },
    select: { id: true },
  });
  if (!person) {
    throw new AppError("NOT_FOUND", "Person not found");
  }

  const [links, audits] = await Promise.all([
    prisma.personSourceReport.findMany({
      where: { personId },
      include: {
        reportImport: { select: { format: true, contentHash: true } },
      },
    }),
    createAuditLogRepository(prisma).listForEntity("Person", personId, take),
  ]);

  const events = mergePersonTimeline(
    links.map((row) => ({
      id: row.id,
      importedAt: row.importedAt.toISOString(),
      contentHash: row.contentHash || row.reportImport.contentHash,
      format: dbFormatToParser(row.reportImport.format),
      query: row.query,
      reportId: row.reportImportId,
    })),
    audits.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      createdAt: row.createdAt.toISOString(),
      payload: row.payload,
    })),
  );

  return events.slice(0, take);
}
