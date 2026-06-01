import { PageLayout } from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function VoteDetailLoading() {
  return (
    <PageLayout header={{ backHref: "/votes", backLabel: "← All Votes" }}>
      <div className="space-y-6">
        {/* Header card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Skeleton className="mb-3 h-6 w-20 rounded-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1 h-4 w-2/3" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>

        {/* Vote form / results card */}
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
