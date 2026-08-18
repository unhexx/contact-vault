"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/react";

export function OperatorSession({
  authEnabled,
  operator,
}: {
  authEnabled: boolean;
  operator: string | null;
}) {
  const router = useRouter();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
  });

  if (!authEnabled) return null;

  return (
    <div className="flex items-center gap-2">
      {operator ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {operator}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Sign out"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </Button>
    </div>
  );
}
