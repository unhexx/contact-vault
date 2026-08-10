import { Suspense } from "react";

import { Contact360 } from "@/components/contact-360";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContactDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      }
    >
      <Contact360 personId={id} />
    </Suspense>
  );
}
