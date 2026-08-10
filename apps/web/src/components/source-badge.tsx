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

export function SourceBadge({ provenance, className }: SourceBadgeProps) {
  const list = Array.isArray(provenance) ? provenance : [provenance];
  if (list.length === 0) return null;

  // Deduplicate by sourceName for compact display
  const seen = new Set<string>();
  const unique = list.filter((p) => {
    const key = p.sourceName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {unique.map((p, i) => (
        <Tooltip key={`${p.sourceName}-${i}`}>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="cursor-help font-normal"
              tabIndex={0}
            >
              {badgeLabel(p)}
              {list.filter((x) => x.sourceName === p.sourceName).length > 1
                ? ` ×${list.filter((x) => x.sourceName === p.sourceName).length}`
                : ""}
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
