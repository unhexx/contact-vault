import { Suspense } from "react";

import { MergeInbox } from "@/components/merge-inbox";
import { Skeleton } from "@/components/ui/skeleton";

export default function MergePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <MergeInbox />
    </Suspense>
  );
}
