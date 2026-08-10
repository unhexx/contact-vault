/**
 * Root app router — contacts + reports + merge.
 */
import { contactsRouter } from "./routers/contacts.js";
import { mergeRouter } from "./routers/merge.js";
import { reportsRouter } from "./routers/reports.js";
import { router } from "./trpc.js";

export const appRouter = router({
  contacts: contactsRouter,
  reports: reportsRouter,
  merge: mergeRouter,
});

export type AppRouter = typeof appRouter;
