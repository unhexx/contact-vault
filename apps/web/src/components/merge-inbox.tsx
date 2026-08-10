"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";

import { MergeSuggestionCard } from "@/components/merge-suggestion-card";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/react";

/**
 * Open merge suggestions inbox with Accept / Dismiss and collision preview.
 */
export function MergeInbox() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("suggestionId");

  const query = trpc.merge.listSuggestions.useQuery({ status: "open" });

  useEffect(() => {
    if (!highlightId || !query.data?.length) return;
    const el = document.getElementById(`suggestion-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, query.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Merge inbox</h1>
        <p className="text-sm text-muted-foreground">
          Exact-match suggestions only. Review matched fields and collisions,
          then <strong>Accept</strong> (new → target survivor) or{" "}
          <strong>Dismiss</strong> (keep both). No silent merge.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/40 p-4 text-sm">
          Failed to load suggestions: {query.error.message}
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex items-start gap-3 pt-6 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              No open merge suggestions. Import reports that share phones,
              emails, or documents to generate exact-match candidates.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {(query.data ?? []).map((s) => (
            <li key={s.id}>
              <MergeSuggestionCard
                suggestion={s}
                highlighted={s.id === highlightId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
