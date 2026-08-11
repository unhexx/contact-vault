"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { Person } from "@contact-vault/domain";
import { GitMerge, Trash2 } from "lucide-react";

import { CopyField } from "@/components/copy-field";
import { MergeSuggestionCard } from "@/components/merge-suggestion-card";
import { PersonHeader } from "@/components/person-header";
import { SourceBadge } from "@/components/source-badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  contactPointKindLabel,
  contactPointLabel,
  documentTypeLabel,
  formatRiskOverall,
  incidentSeverityVariant,
  isContact360Tab,
  primaryEmails,
  primaryPhones,
  riskOverallTone,
  type Contact360Tab,
} from "@/lib/contact-helpers";
import { cn, formatDisplayDate } from "@/lib/utils";
import { trpc } from "@/trpc/react";

export function Contact360({ personId }: { personId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Contact360Tab = isContact360Tab(tabParam) ? tabParam : "overview";

  const personQuery = trpc.contacts.get360.useQuery({ id: personId });
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
          <TabsTrigger value="overview" aria-label="Overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="identity" aria-label="Identity">
            Identity
          </TabsTrigger>
          <TabsTrigger value="documents" aria-label="Documents">
            Documents
          </TabsTrigger>
          <TabsTrigger value="addresses" aria-label="Addresses">
            Addresses
          </TabsTrigger>
          <TabsTrigger value="network" aria-label="Network">
            Network
          </TabsTrigger>
          <TabsTrigger value="risk" aria-label="Risk">
            Risk
          </TabsTrigger>
          <TabsTrigger value="sources" aria-label="Sources">
            Sources
          </TabsTrigger>
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
        <TabsContent value="risk">
          <RiskTab person={person} />
        </TabsContent>
        <TabsContent value="sources">
          <SourcesTab person={person} />
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
  suggestions: Array<{
    id: string;
    newPersonId: string;
    targetPersonId: string;
    matchedOn: unknown;
    status: string;
    createdAt?: string;
    reportImportId?: string;
  }>;
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
        review Sources on the survivor to confirm imports from both persons.
      </p>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <li key={s.id}>
              <MergeSuggestionCard
                suggestion={s}
                // If this person is the target, stay on Sources after accept
                acceptNavigateTo={
                  s.targetPersonId === personId
                    ? `/contacts/${personId}?tab=sources`
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

function FactRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function OverviewTab({ person }: { person: Person }) {
  const phones = useMemo(() => primaryPhones(person), [person]);
  const emails = useMemo(() => primaryEmails(person), [person]);
  const socials = person.contactPoints.filter(
    (c) => c.kind === "social" || c.kind === "messenger",
  );
  const riskScores = person.riskScores ?? [];
  const primaryRisk = riskScores[0];
  const highIncidentCount = (person.incidents ?? []).filter(
    (i) => i.severity === "high",
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick facts</CardTitle>
        <CardDescription>
          Canonical identity and primary contact points
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          <FactRow label="Name">
            {person.canonicalName ? (
              <div className="flex flex-wrap items-center gap-2">
                <CopyField
                  value={person.canonicalName.full}
                  label="Name"
                />
                <SourceBadge provenance={person.canonicalName.provenance} />
              </div>
            ) : (
              <EmptyHint>No canonical name</EmptyHint>
            )}
          </FactRow>
          <FactRow label="DOB">
            {person.dateOfBirth ? (
              <CopyField value={person.dateOfBirth} label="Date of birth" />
            ) : (
              <EmptyHint>—</EmptyHint>
            )}
          </FactRow>
          <FactRow label="Place of birth">
            {person.placeOfBirth ? (
              <CopyField value={person.placeOfBirth} label="Place of birth" />
            ) : (
              <EmptyHint>—</EmptyHint>
            )}
          </FactRow>
          <FactRow label="Gender">
            {person.gender ? (
              <span className="capitalize">{person.gender}</span>
            ) : (
              <EmptyHint>—</EmptyHint>
            )}
          </FactRow>
          {primaryRisk ? (
            <FactRow label="Risk">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/contacts/${person.id}?tab=risk`}
                  className={cn(
                    "rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    riskOverallTone(primaryRisk.overall) === "destructive" &&
                      "text-destructive",
                    riskOverallTone(primaryRisk.overall) === "warning" &&
                      "text-amber-700 dark:text-amber-300",
                    riskOverallTone(primaryRisk.overall) === "muted" &&
                      "text-muted-foreground",
                  )}
                >
                  Risk: {formatRiskOverall(primaryRisk.overall)}
                  {primaryRisk.label ? ` — ${primaryRisk.label}` : ""}
                </Link>
                {highIncidentCount > 0 ? (
                  <Badge variant="destructive">
                    {highIncidentCount} high severity
                  </Badge>
                ) : null}
              </div>
            </FactRow>
          ) : highIncidentCount > 0 ? (
            <FactRow label="Risk">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/contacts/${person.id}?tab=risk`}
                  className="rounded-md text-sm font-medium text-destructive underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Incidents
                </Link>
                <Badge variant="destructive">
                  {highIncidentCount} high severity
                </Badge>
              </div>
            </FactRow>
          ) : null}
          <FactRow label="Phones">
            {phones.length === 0 ? (
              <EmptyHint>No phones</EmptyHint>
            ) : (
              <ul className="space-y-2">
                {phones.map((cp, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <CopyField
                      value={contactPointLabel(cp)}
                      label="Phone"
                      mono
                    />
                    {"isPrimary" in cp && cp.isPrimary ? (
                      <Badge variant="outline">primary</Badge>
                    ) : null}
                    <SourceBadge provenance={cp.provenance} />
                  </li>
                ))}
              </ul>
            )}
          </FactRow>
          <FactRow label="Emails">
            {emails.length === 0 ? (
              <EmptyHint>No emails</EmptyHint>
            ) : (
              <ul className="space-y-2">
                {emails.map((cp, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <CopyField value={contactPointLabel(cp)} label="Email" />
                    <SourceBadge provenance={cp.provenance} />
                  </li>
                ))}
              </ul>
            )}
          </FactRow>
          <FactRow label="Social / messengers">
            {socials.length === 0 ? (
              <EmptyHint>None</EmptyHint>
            ) : (
              <ul className="space-y-2">
                {socials.map((cp, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {contactPointKindLabel(cp)}
                    </Badge>
                    <CopyField
                      value={contactPointLabel(cp)}
                      label={contactPointKindLabel(cp)}
                    />
                    <SourceBadge provenance={cp.provenance} />
                  </li>
                ))}
              </ul>
            )}
          </FactRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function IdentityTab({ person }: { person: Person }) {
  const variants = [
    ...(person.canonicalName
      ? [{ ...person.canonicalName, _canonical: true as const }]
      : []),
    ...person.nameVariants.map((v) => ({ ...v, _canonical: false as const })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identity</CardTitle>
        <CardDescription>Name variants and gender</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FactRow label="Gender">
          {person.gender ? (
            <span className="capitalize">{person.gender}</span>
          ) : (
            <EmptyHint>—</EmptyHint>
          )}
        </FactRow>
        {variants.length === 0 ? (
          <EmptyHint>No name variants</EmptyHint>
        ) : (
          <ul className="divide-y rounded-md border">
            {variants.map((nv, i) => (
              <li key={i} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyField value={nv.full} label="Full name" />
                  {nv._canonical ? (
                    <Badge>canonical</Badge>
                  ) : (
                    <Badge variant="outline">variant</Badge>
                  )}
                  <SourceBadge provenance={nv.provenance} />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {nv.last ? (
                    <span>
                      Last: <CopyField value={nv.last} label="Last name" />
                    </span>
                  ) : null}
                  {nv.first ? (
                    <span>
                      First: <CopyField value={nv.first} label="First name" />
                    </span>
                  ) : null}
                  {nv.middle ? (
                    <span>
                      Middle:{" "}
                      <CopyField value={nv.middle} label="Patronymic" />
                    </span>
                  ) : null}
                  {nv.dobHint ? (
                    <span>
                      DOB hint:{" "}
                      <CopyField value={nv.dobHint} label="DOB hint" />
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ person }: { person: Person }) {
  if (person.documents.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No documents</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
        <CardDescription>Identity documents with provenance</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Identity documents</caption>
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Type</th>
              <th className="pb-2 pr-3 font-medium">Number</th>
              <th className="pb-2 pr-3 font-medium">Series</th>
              <th className="pb-2 pr-3 font-medium">Issued</th>
              <th className="pb-2 pr-3 font-medium">By</th>
              <th className="pb-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {person.documents.map((doc, i) => (
              <tr key={doc.id ?? i} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <Badge variant="secondary">
                    {documentTypeLabel(doc.type)}
                  </Badge>
                </td>
                <td className="py-2 pr-3">
                  <CopyField value={doc.number} label="Document number" mono />
                </td>
                <td className="py-2 pr-3">
                  {doc.series ? (
                    <CopyField value={doc.series} label="Series" mono />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-3">
                  {doc.issuedAt ? (
                    <CopyField value={doc.issuedAt} label="Issued at" />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-3 max-w-[180px] truncate">
                  {doc.issuedBy ? (
                    <CopyField value={doc.issuedBy} label="Issued by" />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2">
                  <SourceBadge provenance={doc.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AddressesTab({ person }: { person: Person }) {
  if (person.addresses.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No addresses</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Addresses</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {person.addresses.map((a, i) => (
            <li key={a.id ?? i} className="rounded-lg border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{a.category}</Badge>
                <SourceBadge provenance={a.provenance} />
              </div>
              <CopyField value={a.raw} label="Address" className="text-sm" />
              {a.normalized && a.normalized !== a.raw ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Normalized:{" "}
                  <CopyField value={a.normalized} label="Normalized address" />
                </p>
              ) : null}
              {a.period?.from || a.period?.to ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Period: {a.period.from ?? "?"} — {a.period.to ?? "?"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NetworkTab({ person }: { person: Person }) {
  if (person.relationships.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No relationships</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Network</CardTitle>
        <CardDescription>
          Related people from report hints (not separate contacts unless linked)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {person.relationships.map((r, i) => {
            const hint = r.relatedPersonHint;
            return (
              <li key={r.id ?? i} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge>{r.type}</Badge>
                  {r.relationLabel ? (
                    <span className="text-muted-foreground">
                      {r.relationLabel}
                    </span>
                  ) : null}
                  <SourceBadge provenance={r.provenance} />
                </div>
                {hint?.fio ? (
                  <div>
                    FIO: <CopyField value={hint.fio} label="Related FIO" />
                  </div>
                ) : null}
                {hint?.dob ? (
                  <div className="text-muted-foreground">
                    DOB: <CopyField value={hint.dob} label="Related DOB" />
                  </div>
                ) : null}
                {hint?.phones?.length ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {hint.phones.map((p, j) => (
                      <CopyField key={j} value={p} label="Related phone" mono />
                    ))}
                  </div>
                ) : null}
                {r.sharedAddress ? (
                  <div className="mt-1 text-muted-foreground">
                    Shared address:{" "}
                    <CopyField
                      value={r.sharedAddress}
                      label="Shared address"
                    />
                  </div>
                ) : null}
                {r.relatedPersonId ? (
                  <Button asChild size="sm" variant="link" className="mt-1 px-0">
                    <Link href={`/contacts/${r.relatedPersonId}`}>
                      Open linked contact
                    </Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function RiskTab({ person }: { person: Person }) {
  const riskScores = person.riskScores ?? [];
  const incidents = person.incidents ?? [];

  if (riskScores.length === 0 && incidents.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No risk scores or incidents</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk scores</CardTitle>
          <CardDescription>
            Overall score, categories, and article codes from source reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          {riskScores.length === 0 ? (
            <EmptyHint>No risk scores</EmptyHint>
          ) : (
            <ul className="space-y-4">
              {riskScores.map((rs, i) => {
                const tone = riskOverallTone(rs.overall);
                return (
                  <li
                    key={rs.id ?? i}
                    className="space-y-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          tone === "destructive" && "text-destructive",
                          tone === "warning" &&
                            "text-amber-700 dark:text-amber-300",
                          tone === "muted" && "text-muted-foreground",
                        )}
                      >
                        {formatRiskOverall(rs.overall)}
                      </span>
                      {rs.label ? (
                        <Badge
                          variant={
                            tone === "destructive"
                              ? "destructive"
                              : tone === "warning"
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {rs.label}
                        </Badge>
                      ) : null}
                      <SourceBadge provenance={rs.provenance} />
                    </div>
                    {rs.categories.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Categories
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {rs.categories.map((cat, ci) => (
                            <li key={`${cat.name}-${ci}`}>
                              <Badge
                                variant={
                                  cat.flag === 1 ? "destructive" : "outline"
                                }
                                className={
                                  cat.flag === 1 ? undefined : "font-normal"
                                }
                              >
                                {cat.name}
                                {cat.flag === 1 ? " · flag" : ""}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {rs.articles.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Articles
                        </p>
                        <ul className="space-y-1.5">
                          {rs.articles.map((art, ai) => (
                            <li
                              key={`${art.code}-${ai}`}
                              className="rounded-md border bg-muted/20 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <CopyField
                                  value={art.code}
                                  label="Article code"
                                  mono
                                />
                                {art.category ? (
                                  <Badge variant="secondary" className="font-normal">
                                    {art.category}
                                  </Badge>
                                ) : null}
                              </div>
                              {art.details ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {art.details}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incidents</CardTitle>
          <CardDescription>
            Criminal / case history with severity and identifiers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <EmptyHint>No incidents</EmptyHint>
          ) : (
            <ul className="space-y-3">
              {incidents.map((inc, i) => (
                <li
                  key={inc.id ?? i}
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={incidentSeverityVariant(inc.severity)}>
                      {inc.severity}
                    </Badge>
                    {inc.title ? (
                      <span className="font-medium">{inc.title}</span>
                    ) : null}
                    <SourceBadge provenance={inc.provenance} />
                  </div>
                  <dl className="grid gap-1.5 sm:grid-cols-[120px_1fr]">
                    {inc.articleCode ? (
                      <>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Article
                        </dt>
                        <dd>
                          <CopyField
                            value={inc.articleCode}
                            label="Article code"
                            mono
                          />
                        </dd>
                      </>
                    ) : null}
                    {inc.caseNumber ? (
                      <>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Case
                        </dt>
                        <dd>
                          <CopyField
                            value={inc.caseNumber}
                            label="Case number"
                            mono
                          />
                        </dd>
                      </>
                    ) : null}
                    {inc.sentenceDate ? (
                      <>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Sentence date
                        </dt>
                        <dd>
                          <CopyField
                            value={inc.sentenceDate}
                            label="Sentence date"
                          />
                        </dd>
                      </>
                    ) : null}
                    {inc.decision ? (
                      <>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Decision
                        </dt>
                        <dd>
                          <CopyField value={inc.decision} label="Decision" />
                        </dd>
                      </>
                    ) : null}
                    {inc.region ? (
                      <>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Region
                        </dt>
                        <dd>
                          <CopyField value={inc.region} label="Region" />
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {inc.tags && inc.tags.length > 0 ? (
                    <ul className="flex flex-wrap gap-1">
                      {inc.tags.map((t) => (
                        <li key={t}>
                          <Badge variant="outline" className="font-normal">
                            {t}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SourcesTab({ person }: { person: Person }) {
  if (person.sourceReports.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No source reports linked</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sources</CardTitle>
        <CardDescription>
          Report imports, content hashes, and parse warnings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {person.sourceReports.map((s, i) => {
            const warnings = s.warnings ?? [];
            return (
              <li
                key={`${s.reportId}-${i}`}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {s.mode ? <Badge variant="secondary">{s.mode}</Badge> : null}
                  <span className="text-muted-foreground">
                    Imported {formatDisplayDate(s.importedAt)}
                  </span>
                  {warnings.length > 0 ? (
                    <Badge variant="warning">
                      {warnings.length} warning
                      {warnings.length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1 font-mono text-xs">
                  <div>
                    reportId:{" "}
                    <CopyField value={s.reportId} label="Report ID" mono />
                  </div>
                  <div>
                    contentHash:{" "}
                    <CopyField
                      value={s.contentHash}
                      label="Content hash"
                      mono
                    />
                  </div>
                  <div>
                    query: <CopyField value={s.query} label="Report query" />
                  </div>
                </div>
                {warnings.length > 0 ? (
                  <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2 text-xs">
                    {warnings.map((w, wi) => (
                      <li key={`${w.code}-${wi}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              w.severity === "error"
                                ? "destructive"
                                : w.severity === "warn"
                                  ? "warning"
                                  : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {w.code}
                          </Badge>
                          <span>{w.message}</span>
                        </div>
                        {(w.section || w.key) && (
                          <p className="mt-0.5 text-muted-foreground">
                            {[w.section, w.key].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
