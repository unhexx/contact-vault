"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GitMerge, Search, Trash2 } from "lucide-react";

import { CopyField } from "@/components/copy-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { formatDisplayDate } from "@/lib/utils";
import { trpc } from "@/trpc/react";

export function ContactList() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function onSearchChange(value: string) {
    setQ(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQ(value.trim());
      timerRef.current = null;
    }, 250);
  }

  const listQuery = trpc.contacts.list.useQuery(
    { q: debouncedQ || undefined, limit: 50 },
    { placeholderData: (prev) => prev },
  );

  const softDelete = trpc.contacts.softDelete.useMutation({
    onSuccess: async () => {
      toast({ title: "Contact deleted", description: "Soft-deleted successfully" });
      setDeleteId(null);
      await Promise.all([
        utils.contacts.list.invalidate(),
        utils.merge.listSuggestions.invalidate(),
        utils.contacts.get360.invalidate(),
      ]);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err.message,
      });
    },
  });

  const items = listQuery.data?.items ?? [];
  const deleteTarget = useMemo(
    () => items.find((i) => i.id === deleteId) ?? null,
    [items, deleteId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Search by name, phone, email, or document number
          </p>
        </div>
        <Button asChild>
          <Link href="/import">Import report</Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search contacts…"
          className="pl-9"
          aria-label="Search contacts"
        />
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading contacts">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : listQuery.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Failed to load contacts: {listQuery.error.message}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {debouncedQ
              ? "No contacts match your search."
              : "No contacts yet. Import a report to get started."}
          </p>
          {!debouncedQ ? (
            <Button asChild className="mt-4" variant="secondary">
              <Link href="/import">Import report</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border" role="list">
          {items.map((person) => (
            <li
              key={person.id}
              className="flex flex-col gap-2 p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/contacts/${person.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {person.displayName}
                  </Link>
                  {person.openSuggestionCount > 0 ? (
                    <Link href="/merge" title="Open merge suggestions">
                      <Badge variant="warning" className="gap-1">
                        <GitMerge className="h-3 w-3" />
                        {person.openSuggestionCount}
                      </Badge>
                    </Link>
                  ) : null}
                  {person.sourceCount > 0 ? (
                    <Badge variant="outline" className="font-normal">
                      {person.sourceCount} source
                      {person.sourceCount === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {person.primaryPhone ? (
                    <CopyField
                      value={person.primaryPhone}
                      label="Phone"
                      mono
                      className="text-muted-foreground"
                    />
                  ) : null}
                  {person.primaryEmail ? (
                    <CopyField
                      value={person.primaryEmail}
                      label="Email"
                      className="text-muted-foreground"
                    />
                  ) : null}
                  <span className="text-xs">
                    Updated {formatDisplayDate(person.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/contacts/${person.id}`}>Open</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${person.displayName}`}
                  onClick={() => setDeleteId(person.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {listQuery.data?.nextCursor ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing first page (more available — pagination UI in a later pass).
        </p>
      ) : null}

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Soft-delete contact?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `"${deleteTarget.displayName}" will be hidden from the list. Open merge suggestions involving this person will be dismissed.`
                : "This contact will be soft-deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteId || softDelete.isPending}
              onClick={() => {
                if (deleteId) softDelete.mutate({ id: deleteId });
              }}
            >
              {softDelete.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
