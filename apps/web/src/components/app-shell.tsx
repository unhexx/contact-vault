"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitMerge, Import, Users } from "lucide-react";
import type { ReactNode } from "react";

import { OperatorSession } from "@/components/operator-session";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/import", label: "Import", icon: Import },
  { href: "/merge", label: "Merge", icon: GitMerge },
] as const;

export function AppShell({
  children,
  authEnabled = false,
  operator = null,
}: {
  children: ReactNode;
  authEnabled?: boolean;
  operator?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/contacts"
              className="text-sm font-semibold tracking-tight"
            >
              Contact Vault
            </Link>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
              {nav.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <OperatorSession authEnabled={authEnabled} operator={operator} />
            <ThemeToggle />
          </div>
        </div>
        {/* Mobile bottom-ish secondary nav in header strip */}
        <nav
          className="container flex gap-1 overflow-x-auto pb-2 sm:hidden"
          aria-label="Main mobile"
        >
          {nav.map(({ href, label }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}
