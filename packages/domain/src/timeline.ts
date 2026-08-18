import { z } from "zod";
import { ReportFormatSchema, type ReportFormat } from "./report-import.js";

/**
 * Person-level evidence log event (import + audit).
 * Append-only: callers must not collapse or rewrite history.
 */
export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  action: z.string().min(1),
  actor: z.string().min(1),
  contentHash: z.string().optional(),
  format: ReportFormatSchema.optional(),
  source: z.enum(["source_report", "audit"]),
  payload: z.unknown().optional(),
});

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export type TimelineImportInput = {
  id: string;
  importedAt: string;
  contentHash: string;
  format?: ReportFormat;
  query?: string;
  reportId?: string;
};

export type TimelineAuditInput = {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  payload?: unknown;
};

function payloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function auditFormat(payload: unknown): ReportFormat | undefined {
  const raw = payloadString(payload, "format");
  if (!raw) return undefined;
  const parsed = ReportFormatSchema.safeParse(raw);
  return parsed.success ? parsed.data : "unknown";
}

/**
 * Combine PersonSourceReport / ReportImport rows with Person audit_log rows.
 * Newest first. Duplicate contentHash / same-second events are kept.
 */
export function mergePersonTimeline(
  imports: readonly TimelineImportInput[],
  audits: readonly TimelineAuditInput[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const row of imports) {
    events.push({
      id: row.id.startsWith("psr:") ? row.id : `psr:${row.id}`,
      at: row.importedAt,
      action: "import",
      actor: "local",
      contentHash: row.contentHash,
      format: row.format,
      source: "source_report",
      payload: {
        ...(row.reportId ? { reportId: row.reportId } : {}),
        ...(row.query != null ? { query: row.query } : {}),
      },
    });
  }

  for (const row of audits) {
    const contentHash = payloadString(row.payload, "contentHash");
    const format = auditFormat(row.payload);
    events.push({
      id: row.id,
      at: row.createdAt,
      action: row.action,
      actor: row.actor,
      ...(contentHash ? { contentHash } : {}),
      ...(format ? { format } : {}),
      source: "audit",
      payload: row.payload,
    });
  }

  events.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    if (a.id !== b.id) return a.id < b.id ? 1 : -1;
    return 0;
  });

  return events;
}
