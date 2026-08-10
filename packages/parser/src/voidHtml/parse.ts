import type { PersonDraft, Relationship } from "@contact-vault/domain";
import type { ParseWarning } from "../types.js";
import { collectPersonFromEmbed } from "./collectPerson.js";
import { extractReportEmbed } from "./extractEmbed.js";

export type VoidHtmlParseResult = {
  persons: PersonDraft[];
  relationships: Relationship[];
  reportQuery?: string;
  warnings: ParseWarning[];
};

/**
 * void-html pipeline: extract embed JSON → collect PersonDraft.
 * No live /api/report poll.
 */
export function parseVoidHtml(
  content: string,
  opts: { reportId: string; extractedAt: string },
): VoidHtmlParseResult {
  const warnings: ParseWarning[] = [];
  const embed = extractReportEmbed(content);

  if (!embed.ok) {
    warnings.push({
      code: embed.reason === "missing" ? "EMBED_MISSING" : "EMBED_PARSE_ERROR",
      message: embed.message,
      severity: embed.reason === "missing" ? "error" : "error",
    });
    // DOM fallback not implemented — pure regex extract only in v0.1
    return { persons: [], relationships: [], warnings };
  }

  const collected = collectPersonFromEmbed(embed.data, {
    reportId: opts.reportId,
    extractedAt: opts.extractedAt,
    sourceName: "void-html",
  });
  warnings.push(...collected.warnings);

  if (!collected.person) {
    return {
      persons: [],
      relationships: collected.orphanRelationships ?? [],
      reportQuery: collected.reportQuery,
      warnings,
    };
  }

  // Prefer nested relationships under person; also mirror top-level for convenience
  return {
    persons: [collected.person],
    relationships: [...collected.person.relationships],
    reportQuery: collected.reportQuery,
    warnings,
  };
}
