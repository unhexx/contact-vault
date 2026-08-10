"use client";

import type { Provenance } from "@contact-vault/domain";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SourceBadgeProps = {
  provenance: Provenance | Provenance[];
  className?: string;
};

function badgeLabel(p: Provenance): string {
  return p.sourceName || "source";
}

function tooltipBody(p: Provenance): string {
  const lines = [
    p.sourceName,
    p.section ? `Section: ${p.section}` : null,
    p.originalKey ? `Key: ${p.originalKey}` : null,
    p.originalValue ? `Value: ${p.originalValue}` : null,
    p.reportQuery ? `Query: ${p.reportQuery}` : null,
    p.confidence != null ? `Confidence: ${p.confidence}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Group key for compact badges; still list every provenance line in the tooltip. */
function sourceGroupKey(p: Provenance): string {
  return p.sourceName || "source";
}

function groupTooltip(entries: Provenance[]): string {
  if (entries.length === 1) {
    const first = entries[0];
    return first ? tooltipBody(first) : "";
  }
  return entries
    .map((p, i) => {
      const body = tooltipBody(p);
      return `—— ${i + 1}/${entries.length} ——\n${body}`;
    })
    .join("\n\n");
}

export function SourceBadge({ provenance, className }: SourceBadgeProps) {
  const list = Array.isArray(provenance) ? provenance : [provenance];
  if (list.length === 0) return null;

  // Compact one badge per sourceName; tooltip lists every provenance entry
  // so originalKey/originalValue/section are never dropped (review Issue 3).
  const groups = new Map<string, Provenance[]>();
  for (const p of list) {
    const key = sourceGroupKey(p);
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}
    >
      {Array.from(groups.entries()).map(([name, entries]) => (
        <Tooltip key={name}>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="cursor-help font-normal"
              tabIndex={0}
            >
              {badgeLabel(entries[0]!)}
              {entries.length > 1 ? ` ×${entries.length}` : ""}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap">
            {groupTooltip(entries)}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

/** Render one badge per provenance entry (no dedupe) for Sources detail. */
export function SourceBadgeList({ provenance }: { provenance: Provenance[] }) {
  if (!provenance?.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {provenance.map((p, i) => (
        <Tooltip key={`${p.reportId}-${p.sourceName}-${i}`}>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-help font-normal">
              {badgeLabel(p)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="whitespace-pre-wrap">
            {tooltipBody(p)}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
