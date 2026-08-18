"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  GitMerge,
  Loader2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  asMatchedOn,
  entityCountEntries,
  matchedFieldLabel,
  mergeDirectionLabel,
  totalEntityCount,
  type MatchedOnField,
} from "@/lib/merge-ui";
import { cn, formatDisplayDate, shortId } from "@/lib/utils";
import { trpc } from "@/trpc/react";

export type MergeSuggestionListItem = {
  id: string;
  newPersonId: string;
  targetPersonId: string;
  matchedOn: MatchedOnField[] | unknown;
  status: string;
  createdAt?: string;
  reportImportId?: string;
};

type MergeSuggestionCardProps = {
  suggestion: MergeSuggestionListItem;
  /** Deep-link highlight from import /merge?suggestionId= */
  highlighted?: boolean;
  /**
   * When set, Accept navigates here instead of the default target Timeline tab.
   * Default: `/contacts/{targetPersonId}?tab=timeline`
   */
  acceptNavigateTo?: string;
  className?: string;
};

/**
 * Merge suggestion card: matched fields, collision preview, Accept / Dismiss.
 * Accept always merges new → target (no silent merge). Dismiss keeps both.
 */
export function MergeSuggestionCard({
  suggestion,
  highlighted = false,
  acceptNavigateTo,
  className,
}: MergeSuggestionCardProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);

  const matchedOn = asMatchedOn(suggestion.matchedOn);

  const previewQuery = trpc.merge.preview.useQuery(
    { suggestionId: suggestion.id },
    {
      // Preview is advisory; keep card usable if preview fails
      retry: 1,
      staleTime: 30_000,
    },
  );

  const acceptMutation = trpc.merge.accept.useMutation({
    onSuccess: async (data) => {
      toast({
        title: "Merge accepted",
        description:
          "New person merged into target. Source reports moved to survivor.",
      });
      setConfirmOpen(false);
      await Promise.all([
        utils.merge.listSuggestions.invalidate(),
        utils.contacts.list.invalidate(),
        utils.contacts.get360.invalidate(),
        utils.contacts.timeline.invalidate(),
      ]);
      const dest =
        acceptNavigateTo ??
        `/contacts/${data.targetPersonId}?tab=timeline`;
      router.push(dest);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Accept failed",
        description: err.message,
      });
    },
  });

  const dismissMutation = trpc.merge.dismiss.useMutation({
    onSuccess: async () => {
      toast({
        title: "Suggestion dismissed",
        description: "Both contacts kept separate.",
      });
      setDismissOpen(false);
      await Promise.all([
        utils.merge.listSuggestions.invalidate(),
        utils.contacts.list.invalidate(),
        utils.contacts.get360.invalidate(),
        utils.contacts.timeline.invalidate(),
      ]);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Dismiss failed",
        description: err.message,
      });
    },
  });

  const busy = acceptMutation.isPending || dismissMutation.isPending;
  const collisions = previewQuery.data?.collisions ?? [];
  const preview = previewQuery.data;

  return (
    <Card
      id={`suggestion-${suggestion.id}`}
      className={cn(highlighted && "ring-2 ring-primary", className)}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <GitMerge className="h-4 w-4 shrink-0" aria-hidden />
          <CardTitle className="text-base">Exact match suggestion</CardTitle>
          <Badge variant="warning">{suggestion.status}</Badge>
          {highlighted ? <Badge variant="default">from import</Badge> : null}
        </div>
        <CardDescription className="space-y-1">
          <span className="block font-mono text-xs">
            {shortId(suggestion.id, 12)}…
            {suggestion.createdAt
              ? ` · ${formatDisplayDate(suggestion.createdAt)}`
              : null}
          </span>
          <span className="block text-xs">{mergeDirectionLabel()}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Matched on
          </h3>
          {matchedOn.length === 0 ? (
            <p className="text-muted-foreground">—</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {matchedOn.map((m, i) => (
                <li key={`${m.field}-${m.value}-${i}`}>
                  <Badge variant="secondary" className="font-mono font-normal">
                    {matchedFieldLabel(m.field)}: {m.value}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/contacts/${suggestion.newPersonId}`}>
              New {shortId(suggestion.newPersonId)}
            </Link>
          </Button>
          <ArrowRight
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <Button asChild size="sm" variant="outline">
            <Link href={`/contacts/${suggestion.targetPersonId}`}>
              Target {shortId(suggestion.targetPersonId)}
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">(survivor)</span>
        </section>

        <section className="rounded-lg border bg-muted/20 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Collision preview
          </h3>
          {previewQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : previewQuery.isError ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Preview unavailable: {previewQuery.error.message}. You can still
              Accept or Dismiss.
            </p>
          ) : preview ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] text-left text-xs">
                  <caption className="sr-only">
                    Entity counts for source (new) and target (survivor)
                  </caption>
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-1.5 pr-2 font-medium">Entity</th>
                      <th className="pb-1.5 pr-2 font-medium">New (source)</th>
                      <th className="pb-1.5 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entityCountEntries(preview.source).map((row) => (
                      <tr key={row.key} className="border-b border-border/50">
                        <td className="py-1 pr-2">{row.label}</td>
                        <td className="py-1 pr-2 font-mono">
                          {preview.source[row.key]}
                        </td>
                        <td className="py-1 font-mono">
                          {preview.target[row.key]}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="pt-1.5 pr-2">Total</td>
                      <td className="pt-1.5 pr-2 font-mono">
                        {totalEntityCount(preview.source)}
                      </td>
                      <td className="pt-1.5 font-mono">
                        {totalEntityCount(preview.target)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Norm-key collisions ({collisions.length})
                </p>
                {collisions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No phone / email / document key collisions beyond the match
                    keys (or already listed). Overlapping facts will merge
                    provenance on the survivor.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {collisions.map((c, i) => (
                      <li key={`${c.field}-${c.value}-${i}`}>
                        <Badge
                          variant="warning"
                          className="font-mono font-normal"
                        >
                          {matchedFieldLabel(c.field)}: {c.value}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            {acceptMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Accept merge
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setDismissOpen(true)}
          >
            {dismissMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Dismiss
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Accept merges the new person into the target (no silent merge). Dismiss
          keeps both contacts.
        </p>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept merge?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This merges the <strong>new</strong> person into the{" "}
                  <strong>target</strong> (survivor). The new person will be
                  soft-deleted. Child facts and source-report links move to the
                  target; overlapping phones/emails/docs append provenance.
                </p>
                <p className="font-mono text-xs">
                  {shortId(suggestion.newPersonId)} →{" "}
                  {shortId(suggestion.targetPersonId)}
                </p>
                {collisions.length > 0 ? (
                  <p>
                    {collisions.length} norm-key collision
                    {collisions.length === 1 ? "" : "s"} will be resolved by
                    keeping the target row and merging provenance.
                  </p>
                ) : null}
                <p>
                  After accept you will open the target contact Timeline tab to
                  verify imports from both persons.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={acceptMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={acceptMutation.isPending}
              onClick={() =>
                acceptMutation.mutate({ suggestionId: suggestion.id })
              }
            >
              {acceptMutation.isPending ? "Merging…" : "Confirm accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss suggestion?</DialogTitle>
            <DialogDescription>
              Keep both contacts separate. This does not merge or delete either
              person. You can still merge later via another suggestion.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDismissOpen(false)}
              disabled={dismissMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={dismissMutation.isPending}
              onClick={() =>
                dismissMutation.mutate({ suggestionId: suggestion.id })
              }
            >
              {dismissMutation.isPending ? "Dismissing…" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
