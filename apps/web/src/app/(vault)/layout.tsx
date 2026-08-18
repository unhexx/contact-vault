import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getServerSession } from "@/server/session";

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (session.enabled && !session.operator) {
    redirect("/login");
  }
  return (
    <AppShell
      authEnabled={session.enabled}
      operator={session.operator?.username ?? null}
    >
      {children}
    </AppShell>
  );
}
