"use client";

import Link from "next/link";
import { ArrowLeft, GitMerge } from "lucide-react";
import type { Person } from "@contact-vault/domain";

import { CopyField } from "@/components/copy-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortId } from "@/lib/utils";

type PersonHeaderProps = {
  person: Person;
  openSuggestionCount?: number;
};

export function PersonHeader({
  person,
  openSuggestionCount = 0,
}: PersonHeaderProps) {
  const name =
    person.canonicalName?.full ||
    person.nameVariants[0]?.full ||
    "Unknown";

  return (
    <div className="sticky top-14 z-30 -mx-4 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-0 sm:px-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link href="/contacts" aria-label="Back to contacts">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-10 text-sm text-muted-foreground">
            <CopyField value={person.id} label="Person ID" mono display={shortId(person.id, 12) + "…"} />
            {person.dateOfBirth ? (
              <span>
                DOB{" "}
                <CopyField value={person.dateOfBirth} label="Date of birth" />
              </span>
            ) : null}
            {openSuggestionCount > 0 ? (
              <Link href="/merge">
                <Badge variant="warning" className="gap-1">
                  <GitMerge className="h-3 w-3" />
                  {openSuggestionCount} open suggestion
                  {openSuggestionCount === 1 ? "" : "s"}
                </Badge>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
