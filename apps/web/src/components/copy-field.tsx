"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type CopyFieldProps = {
  value: string;
  label?: string;
  className?: string;
  mono?: boolean;
  /** Optional display text different from clipboard value */
  display?: string;
};

export function CopyField({
  value,
  label,
  className,
  mono,
  display,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({
        title: "Copied",
        description: label ? `${label} copied to clipboard` : "Copied to clipboard",
      });
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Clipboard permission denied",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Click to copy"
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-left text-sm transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate",
          mono && "font-mono text-xs sm:text-sm",
        )}
      >
        {display ?? value}
      </span>
      <span className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
      <span className="sr-only">Copy {label ?? value}</span>
    </button>
  );
}
