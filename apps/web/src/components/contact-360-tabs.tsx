"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import type { Person } from "@contact-vault/domain";

import { CopyField } from "@/components/copy-field";
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
  contactPointKindLabel,
  contactPointLabel,
  documentTypeLabel,
  primaryEmails,
  primaryPhones,
} from "@/lib/contact-helpers";
import { formatDisplayDate } from "@/lib/utils";

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

export function OverviewTab({ person }: { person: Person }) {
  const phones = useMemo(() => primaryPhones(person), [person]);
  const emails = useMemo(() => primaryEmails(person), [person]);
  const socials = person.contactPoints.filter(
    (c) => c.kind === "social" || c.kind === "messenger",
  );

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

export function IdentityTab({ person }: { person: Person }) {
  const hasCanonical = Boolean(person.canonicalName);
  const extras = person.nameVariants;
  const empty = !hasCanonical && extras.length === 0;

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
        {empty ? (
          <EmptyHint>No name variants</EmptyHint>
        ) : (
          <ul className="divide-y rounded-md border">
            {person.canonicalName ? (
              <li className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyField
                    value={person.canonicalName.full}
                    label="Full name"
                  />
                  <Badge>canonical</Badge>
                  <SourceBadge provenance={person.canonicalName.provenance} />
                </div>
                <NameParts nv={person.canonicalName} />
              </li>
            ) : null}
            {extras.map((nv, i) => (
              <li key={i} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyField value={nv.full} label="Full name" />
                  <Badge variant="outline">variant</Badge>
                  <SourceBadge provenance={nv.provenance} />
                </div>
                <NameParts nv={nv} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NameParts({
  nv,
}: {
  nv: {
    last?: string;
    first?: string;
    middle?: string;
    dobHint?: string;
  };
}) {
  return (
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
          Middle: <CopyField value={nv.middle} label="Patronymic" />
        </span>
      ) : null}
      {nv.dobHint ? (
        <span>
          DOB hint: <CopyField value={nv.dobHint} label="DOB hint" />
        </span>
      ) : null}
    </div>
  );
}

export function DocumentsTab({ person }: { person: Person }) {
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

export function AddressesTab({ person }: { person: Person }) {
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

export function NetworkTab({ person }: { person: Person }) {
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

export function SourcesTab({ person }: { person: Person }) {
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
