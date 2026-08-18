"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GitMerge, Trash2 } from "lucide-react";

import {
  AddressesTab,
  AssetsTab,
  BanksTab,
  DocumentsTab,
  IdentityTab,
  NetworkTab,
  OverviewTab,
  RiskTab,
  SourcesTab,
  TimelineTab,
  WorkTab,
} from "@/components/contact-360-tabs";
import {
  MergeSuggestionCard,
  type MergeSuggestionListItem,
} from "@/components/merge-suggestion-card";
import { PersonHeader } from "@/components/person-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { isContact360Tab, type Contact360Tab } from "@/lib/contact-helpers";
import { trpc } from "@/trpc/react";

export function Contact360({ personId }: { personId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Contact360Tab = isContact360Tab(tabParam) ? tabParam : "overview";

  const personQuery = trpc.contacts.get360.useQuery({ id: personId });
  const timelineQuery = trpc.contacts.timeline.useQuery({ id: personId });
  const suggestionsQuery = trpc.merge.listSuggestions.useQuery({
    personId,
    status: "open",
  });
  const utils = trpc.useUtils();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const softDelete = trpc.contacts.softDelete.useMutation({
    onSuccess: async () => {
      toast({ title: "Contact deleted" });
      await Promise.all([
        utils.contacts.list.invalidate(),
        utils.merge.listSuggestions.invalidate(),
        utils.contacts.get360.invalidate(),
      ]);
      router.push("/contacts");
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err.message,
      });
    },
  });

  const openCount = suggestionsQuery.data?.length ?? 0;

  if (personQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (personQuery.isError || !personQuery.data) {
    return (
      <div className="rounded-lg border border-destructive/40 p-6 text-sm">
        <p className="font-medium">Contact not found</p>
        <p className="mt-1 text-muted-foreground">
          {personQuery.error?.message ?? "This person may have been deleted."}
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/contacts">Back to list</Link>
        </Button>
      </div>
    );
  }

  const person = personQuery.data;

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/contacts/${personId}?${params.toString()}`, {
      scroll: false,
    });
  }

  return (
    <div className="space-y-4">
      <PersonHeader person={person} openSuggestionCount={openCount} />

      {openCount > 0 ? (
        <MergeSuggestionsPanel
          personId={personId}
          suggestions={suggestionsQuery.data ?? []}
          isLoading={suggestionsQuery.isLoading}
        />
      ) : null}

      <div className="flex justify-end">
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Soft-delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Soft-delete this contact?</DialogTitle>
              <DialogDescription>
                The contact will disappear from the list. Related open merge
                suggestions will be dismissed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={softDelete.isPending}
                onClick={() => softDelete.mutate({ id: personId })}
              >
                {softDelete.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="banks">Banks</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab person={person} />
        </TabsContent>
        <TabsContent value="identity">
          <IdentityTab person={person} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab person={person} />
        </TabsContent>
        <TabsContent value="addresses">
          <AddressesTab person={person} />
        </TabsContent>
        <TabsContent value="network">
          <NetworkTab person={person} />
        </TabsContent>
        <TabsContent value="banks">
          <BanksTab person={person} />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab person={person} />
        </TabsContent>
        <TabsContent value="work">
          <WorkTab person={person} />
        </TabsContent>
        <TabsContent value="risk">
          <RiskTab person={person} />
        </TabsContent>
        <TabsContent value="sources">
          <SourcesTab person={person} />
        </TabsContent>
        <TabsContent value="timeline">
          {timelineQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <TimelineTab
              events={timelineQuery.data ?? []}
              error={timelineQuery.error?.message}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MergeSuggestionsPanel({
  personId,
  suggestions,
  isLoading,
}: {
  personId: string;
  suggestions: MergeSuggestionListItem[];
  isLoading: boolean;
}) {
  return (
    <div
      id="merge-suggestions"
      className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50/80 p-3 dark:border-amber-700/50 dark:bg-amber-950/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          <span className="font-medium">
            {suggestions.length} open merge suggestion
            {suggestions.length === 1 ? "" : "s"} for this contact
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/merge">Open full inbox</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Accept merges new → target (survivor). Dismiss keeps both. After accept,
        review Timeline on the survivor to confirm imports from both persons.
      </p>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <li key={s.id}>
              <MergeSuggestionCard
                suggestion={s}
                acceptNavigateTo={
                  s.targetPersonId === personId
                    ? `/contacts/${personId}?tab=timeline`
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
