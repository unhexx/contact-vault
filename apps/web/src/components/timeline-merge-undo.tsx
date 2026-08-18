"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import {
  parseMergeAuditPayload,
  type TimelineEvent,
} from "@contact-vault/domain";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import {
  mergeUndoDisabledReason,
  mergeUndoReasonLabel,
} from "@/lib/merge-ui";
import { shortId } from "@/lib/utils";
import { trpc } from "@/trpc/react";

/**
 * Operator Undo on a Contact 360 timeline merge event.
 * Disabled when mergeUndoBlockReason is set (legacy hard-delete / missing scalars)
 * or when a sibling event already unmerged / superseded this merge.
 */
export function TimelineMergeUndo({
  event,
  events,
}: {
  event: TimelineEvent;
  events: TimelineEvent[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (event.action !== "merge" || event.source !== "audit") return null;

  const reason = mergeUndoDisabledReason(event, events);
  const blocked = reason != null;
  const reasonLabel = reason ? mergeUndoReasonLabel(reason) : null;
  const payload = parseMergeAuditPayload(event.payload);

  const undoMutation = trpc.merge.undo.useMutation({
    onSuccess: async (data) => {
      toast({
        title: "Merge undone",
        description:
          "Source contact restored. The merge audit event stays on the timeline.",
      });
      setConfirmOpen(false);
      await Promise.all([
        utils.merge.listSuggestions.invalidate(),
        utils.contacts.list.invalidate(),
        utils.contacts.get360.invalidate(),
        utils.contacts.timeline.invalidate(),
      ]);
      router.push(`/contacts/${data.targetPersonId}?tab=timeline`);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Undo failed",
        description: err.message,
      });
    },
  });

  const button = (
    <Button
      size="sm"
      variant="outline"
      disabled={blocked || undoMutation.isPending}
      aria-label="Undo merge"
      aria-disabled={blocked || undoMutation.isPending}
      onClick={() => {
        if (blocked) return;
        setConfirmOpen(true);
      }}
    >
      {undoMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Undo2 className="h-3.5 w-3.5" />
      )}
      Undo merge
    </Button>
  );

  return (
    <div className="mt-2 space-y-1">
      {blocked && reasonLabel ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{button}</span>
          </TooltipTrigger>
          <TooltipContent>{reasonLabel}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {reasonLabel ? (
        <p className="text-xs text-muted-foreground">{reasonLabel}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Restores the source contact from this audit event.
        </p>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo this merge?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  The source contact is restored. Children listed on this audit
                  event move back. The merge row stays on the timeline; an
                  Unmerge event is appended.
                </p>
                {payload ? (
                  <p className="font-mono text-xs">
                    {shortId(payload.sourcePersonId)} ←{" "}
                    {shortId(payload.targetPersonId)}
                  </p>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={undoMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={undoMutation.isPending}
              onClick={() =>
                undoMutation.mutate({ auditEventId: event.id })
              }
            >
              {undoMutation.isPending ? "Undoing…" : "Confirm undo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
