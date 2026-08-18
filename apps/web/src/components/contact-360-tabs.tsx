"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import type { Person, TimelineEvent } from "@contact-vault/domain";

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
  formatRiskOverall,
  incidentSeverityVariant,
  pickHighestRiskScore,
  primaryEmails,
  primaryPhones,
  riskOverallTone,
  timelineActionLabel,
  timelineActionVariant,
} from "@/lib/contact-helpers";
import { cn, formatDisplayDate } from "@/lib/utils";

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
  const searchParams = useSearchParams();
  const phones = useMemo(() => primaryPhones(person), [person]);
  const emails = useMemo(() => primaryEmails(person), [person]);
  const socials = person.contactPoints.filter(
    (c) => c.kind === "social" || c.kind === "messenger",
  );
  const primaryRisk = pickHighestRiskScore(person.riskScores ?? []);
  const riskTone = primaryRisk
    ? riskOverallTone(primaryRisk.overall)
    : undefined;
  const highIncidentCount = (person.incidents ?? []).filter(
    (i) => i.severity === "high",
  ).length;
  const riskTabHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "risk");
    return `/contacts/${person.id}?${params.toString()}`;
  }, [person.id, searchParams]);

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
                  href={riskTabHref}
                  className={cn(
                    "rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    riskTone === "destructive" && "text-destructive",
                    riskTone === "warning" &&
                      "text-amber-700 dark:text-amber-300",
                    riskTone === "muted" && "text-muted-foreground",
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
                  href={riskTabHref}
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

export function BanksTab({ person }: { person: Person }) {
  const banks = person.bankRelations ?? [];

  if (banks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No bank relations</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Banks</CardTitle>
        <CardDescription>
          Bank names and account hints from source reports
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {banks.map((b, i) => (
            <li key={b.id ?? i} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <CopyField value={b.bankName} label="Bank name" />
                {b.role ? <Badge variant="outline">{b.role}</Badge> : null}
                <SourceBadge provenance={b.provenance} />
              </div>
              <dl className="grid gap-1.5 sm:grid-cols-[120px_1fr]">
                {b.accountHint ? (
                  <>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Account
                    </dt>
                    <dd>
                      <CopyField
                        value={b.accountHint}
                        label="Account hint"
                        mono
                      />
                    </dd>
                  </>
                ) : null}
                {b.bik ? (
                  <>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      BIK
                    </dt>
                    <dd>
                      <CopyField value={b.bik} label="BIK" mono />
                    </dd>
                  </>
                ) : null}
              </dl>
              {b.extras && Object.keys(b.extras).length > 0 ? (
                <ul className="mt-2 space-y-1 rounded-md border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                  {Object.entries(b.extras).map(([key, value]) => (
                    <li key={key} className="flex flex-wrap gap-1.5">
                      <span className="font-medium">{key}:</span>
                      <CopyField
                        value={
                          typeof value === "string" ? value : JSON.stringify(value)
                        }
                        label={`Bank extra ${key}`}
                        className="text-xs text-muted-foreground"
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AssetsTab({ person }: { person: Person }) {
  const vehicles = person.vehicles ?? [];

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No vehicles</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assets</CardTitle>
        <CardDescription>
          Vehicles and registrations from source reports
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {vehicles.map((v, i) => {
            const title = [v.brand, v.model].filter(Boolean).join(" ");
            return (
              <li key={v.id ?? i} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {title ? (
                    <CopyField value={title} label="Vehicle" />
                  ) : (
                    <span className="text-muted-foreground">Vehicle</span>
                  )}
                  {v.year ? <Badge variant="outline">{v.year}</Badge> : null}
                  {v.category ? (
                    <Badge variant="secondary">{v.category}</Badge>
                  ) : null}
                  <SourceBadge provenance={v.provenance} />
                </div>
                <dl className="grid gap-1.5 sm:grid-cols-[120px_1fr]">
                  {v.plate ? (
                    <>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Plate
                      </dt>
                      <dd>
                        <CopyField value={v.plate} label="Plate" mono />
                      </dd>
                    </>
                  ) : null}
                  {v.vin ? (
                    <>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        VIN
                      </dt>
                      <dd>
                        <CopyField value={v.vin} label="VIN" mono />
                      </dd>
                    </>
                  ) : null}
                  {v.powerHp != null ? (
                    <>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Power
                      </dt>
                      <dd>{v.powerHp} hp</dd>
                    </>
                  ) : null}
                  {v.engineVolumeCc != null ? (
                    <>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Engine
                      </dt>
                      <dd>{v.engineVolumeCc} cc</dd>
                    </>
                  ) : null}
                </dl>
                {v.ownershipPeriods && v.ownershipPeriods.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {v.ownershipPeriods.map((period, pi) => (
                      <li key={pi}>
                        {[
                          period.from || period.to
                            ? `${period.from ?? "?"} — ${period.to ?? "?"}`
                            : null,
                          period.ownerName,
                          period.operationCode,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {v.extras && Object.keys(v.extras).length > 0 ? (
                  <ul className="mt-2 space-y-1 rounded-md border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                    {Object.entries(v.extras).map(([key, value]) => (
                      <li key={key} className="flex flex-wrap gap-1.5">
                        <span className="font-medium">{key}:</span>
                        <CopyField
                          value={
                            typeof value === "string"
                              ? value
                              : JSON.stringify(value)
                          }
                          label={`Vehicle extra ${key}`}
                          className="text-xs text-muted-foreground"
                        />
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

export function RiskTab({ person }: { person: Person }) {
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
                                  <Badge
                                    variant="secondary"
                                    className="font-normal"
                                  >
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
                  {inc.body && Object.keys(inc.body).length > 0 ? (
                    <div className="space-y-1 rounded-md border bg-muted/20 px-2 py-1.5">
                      {Object.entries(inc.body).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex flex-wrap items-baseline gap-1.5 text-xs text-muted-foreground"
                        >
                          {key !== "snippet" ? (
                            <span className="font-medium capitalize">
                              {key}:
                            </span>
                          ) : null}
                          <CopyField
                            value={value}
                            label={
                              key === "snippet"
                                ? "Incident snippet"
                                : `Body ${key}`
                            }
                            className="text-xs text-muted-foreground"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
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

export function TimelineTab({
  events,
  error,
}: {
  events: TimelineEvent[];
  error?: string;
}) {
  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyHint>No import or audit events</EmptyHint>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import timeline</CardTitle>
        <CardDescription>
          Append-only import and audit chain, newest first
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={timelineActionVariant(event.action)}>
                  {timelineActionLabel(event.action)}
                </Badge>
                <span className="text-muted-foreground">{event.actor}</span>
                <span className="text-muted-foreground">
                  {formatDisplayDate(event.at)}
                </span>
                {event.format ? (
                  <Badge variant="outline">{event.format}</Badge>
                ) : null}
              </div>
              {event.contentHash ? (
                <div className="mt-2 font-mono text-xs">
                  contentHash:{" "}
                  <CopyField
                    value={event.contentHash}
                    label="Content hash"
                    mono
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
