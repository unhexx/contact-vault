"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  GitMerge,
  Info,
  Loader2,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { MAX_IMPORT_CHARS } from "@/lib/import-limits";
import { cn, shortId } from "@/lib/utils";
import type { AppRouter } from "@/server/trpc/router";
import { trpc } from "@/trpc/react";

type ImportSuccess = inferRouterOutputs<AppRouter>["reports"]["import"];

const ACCEPT = ".html,.htm,.txt,text/html,text/plain";

export function ImportDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportSuccess | null>(null);
  const utils = trpc.useUtils();

  const importMutation = trpc.reports.import.useMutation({
    onSuccess: async (data) => {
      setResult(data);
      await utils.contacts.list.invalidate();
      await utils.merge.listSuggestions.invalidate();
      toast({
        title: data.duplicate ? "Duplicate report" : "Import complete",
        description: data.duplicate
          ? "Same content hash already imported"
          : `Created ${data.personIds.length} contact(s)`,
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err.message,
      });
    },
  });

  const processFile = useCallback(
    async (file: File) => {
      const name = file.name;
      if (!/\.(html?|txt)$/i.test(name)) {
        toast({
          variant: "destructive",
          title: "Unsupported file",
          description: "Use .html, .htm, or .txt",
        });
        return;
      }
      // Cheap size preflight (UTF-16 units ≈ JS string length after read;
      // reject oversized blobs before reading when File.size is decisive).
      if (file.size > MAX_IMPORT_CHARS * 4) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `Import exceeds max size (${MAX_IMPORT_CHARS.toLocaleString()} characters)`,
        });
        return;
      }
      const content = await file.text();
      if (content.length > MAX_IMPORT_CHARS) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `Import exceeds MAX_IMPORT_CHARS (${MAX_IMPORT_CHARS.toLocaleString()})`,
        });
        return;
      }
      setResult(null);
      importMutation.mutate({ filename: name, content });
    },
    [importMutation],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import report</h1>
        <p className="text-sm text-muted-foreground">
          Upload Void HTML or sectioned text dumps (.html / .htm / .txt). Detected
          format, parse warnings, and merge suggestions appear after import.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload report file"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
          importMutation.isPending && "pointer-events-none opacity-70",
        )}
      >
        {importMutation.isPending ? (
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        ) : (
          <FileUp className="h-10 w-10 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">
            {importMutation.isPending
              ? "Importing…"
              : "Drop a report here or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Accepts .html, .htm, .txt
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void processFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {result ? <ImportResultPanel result={result} /> : null}
    </div>
  );
}

function ImportResultPanel({ result }: { result: ImportSuccess }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-lg">
            {result.duplicate ? "Already imported" : "Import successful"}
          </CardTitle>
          <Badge variant={result.duplicate ? "secondary" : "success"}>
            {result.format}
          </Badge>
          {result.duplicate ? (
            <Badge variant="outline">duplicate</Badge>
          ) : null}
        </div>
        <CardDescription className="font-mono text-xs">
          report {shortId(result.reportImportId, 12)}… · hash{" "}
          {shortId(result.contentHash, 12)}…
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-medium">Persons created / linked</h3>
          {result.personIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No persons in this report.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {result.personIds.map((id) => (
                <li key={id}>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/contacts/${id}`}>Open {shortId(id)}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Parse warnings ({result.warnings.length})
          </h3>
          {result.warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warnings.</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
              {result.warnings.map((w, i) => (
                <li key={`${w.code}-${i}`} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        w.severity === "error"
                          ? "destructive"
                          : w.severity === "warn"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {w.code}
                    </Badge>
                    <span>{w.message}</span>
                  </div>
                  {(w.section || w.key) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[w.section, w.key].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <GitMerge className="h-4 w-4" />
            Merge suggestions ({result.mergeSuggestions.length})
          </h3>
          {result.mergeSuggestions.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              No exact-match merge suggestions for this import.
            </p>
          ) : (
            <ul className="space-y-3">
              {result.mergeSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border bg-muted/20 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">exact match</Badge>
                    <span className="text-muted-foreground">
                      matched on{" "}
                      {s.matchedOn
                        .map((m) => `${m.field}: ${m.value}`)
                        .join(", ")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="default">
                      <Link href={`/merge?suggestionId=${s.id}`}>
                        Review in merge inbox
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/contacts/${s.newPersonId}`}>
                        New person
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/contacts/${s.targetPersonId}`}>
                        Existing match
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
