/**
 * Root app router — contacts + reports + merge + optional auth.
 */
import { authRouter } from "./routers/auth.js";
import { contactsRouter } from "./routers/contacts.js";
import { mergeRouter } from "./routers/merge.js";
import { reportsRouter } from "./routers/reports.js";
import { router } from "./trpc.js";

export const appRouter = router({
  auth: authRouter,
  contacts: contactsRouter,
  reports: reportsRouter,
  merge: mergeRouter,
});

export type AppRouter = typeof appRouter;
