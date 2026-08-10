/**
 * Vanilla tRPC client for server-side callers and future React Query wiring (PR6).
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@/server/trpc/router";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://127.0.0.1:3000"
  );
}

/** Browser / RSC client hitting `/api/trpc`. */
export function createTrpcClient(opts?: { url?: string }) {
  const url = opts?.url ?? `${getBaseUrl()}/api/trpc`;
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        transformer: superjson,
      }),
    ],
  });
}

export type TrpcClient = ReturnType<typeof createTrpcClient>;
