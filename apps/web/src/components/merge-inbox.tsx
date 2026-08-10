"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GitMerge, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { shortId } from "@/lib/utils";
import { trpc } from "@/trpc/react";

/**
 * PR6 discoverability surface for open merge suggestions.
 * Full Accept / Dismiss / preview collision UI lands in PR7.
 */
export function MergeInbox() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("suggestionId");

  const query = trpc.merge.listSuggestions.useQuery({ status: "open" });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Merge inbox</h1>
        <p className="text-sm text-muted-foreground">
          Exact-match suggestions only. Accept and dismiss controls arrive in
          the merge UI pass — for now open both contacts and review matched
          fields.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
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
            <p>No open merge suggestions. Import reports that share phones,
              emails, or documents to generate exact-match candidates.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {(query.data ?? []).map((s) => {
            const highlighted = s.id === highlightId;
            return (
              <li key={s.id}>
                <Card
                  className={
                    highlighted
                      ? "ring-2 ring-primary"
                      : undefined
                  }
                >
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <GitMerge className="h-4 w-4" />
                      <CardTitle className="text-base">
                        Exact match suggestion
                      </CardTitle>
                      <Badge variant="warning">open</Badge>
                      {highlighted ? (
                        <Badge variant="default">from import</Badge>
                      ) : null}
                    </div>
                    <CardDescription className="font-mono text-xs">
                      {shortId(s.id, 12)}…
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Matched on: </span>
                      {(s.matchedOn as Array<{ field: string; value: string }>)
                        .map((m) => `${m.field}: ${m.value}`)
                        .join(", ") || "—"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/contacts/${s.newPersonId}`}>
                          New person {shortId(s.newPersonId)}
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/contacts/${s.targetPersonId}`}>
                          Target person {shortId(s.targetPersonId)}
                        </Link>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Accept / Dismiss actions: PR7 merge UI.
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
