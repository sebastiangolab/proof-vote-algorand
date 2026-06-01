import { PageLayout } from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function VotesLoading() {
  return (
    <PageLayout mainClassName="max-w-4xl px-4 py-8 pb-16">
      {/* Search bar */}
      <Skeleton className="mb-6 h-10 w-full rounded-md" />

      <hr className="mb-4 border-zinc-200" />

      {/* Tabs + controls row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          <Skeleton className="h-8 w-12 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* List rows */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 border-b px-4 py-5 last:border-b-0">
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-72" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
