/**
 * Next.js App Router tRPC HTTP handler (fetch adapter).
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(),
    onError({ error, path }) {
      // Structured log without raw PII content
      console.error(
        JSON.stringify({
          level: "error",
          msg: "tRPC error",
          path,
          code: error.code,
          message: error.message,
        }),
      );
    },
  });

export { handler as GET, handler as POST };
