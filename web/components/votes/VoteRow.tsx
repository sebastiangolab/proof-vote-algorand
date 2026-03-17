import Link from "next/link";

export type VoteRowData = {
  slug: string;
  title: string;
  description?: string | null;
  optionLabels: unknown; // JSON from Prisma — string[] at runtime
  status?: "active" | "ended";
  createdAt?: Date | string | null;
};

export function VoteRow({ vote }: { vote: VoteRowData }) {
  const options = (vote.optionLabels as string[]) ?? [];

  return (
    <Link href={`/votes/${vote.slug}`} className="group block hover:no-underline">
      <div className="flex items-start gap-4 border-b border-l-2 border-l-transparent px-4 py-5 transition-colors hover:border-l-indigo-500 hover:bg-indigo-50/40">
        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900 transition-colors group-hover:text-indigo-700">
                {vote.title}
              </p>
              
              {vote.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{vote.description}</p>
              )}
            </div>

            {/* Status badge */}
            <div className="flex shrink-0 items-center gap-1.5">
              {vote.status === "ended" ? (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                  Ended
                </span>
              ) : (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                  Active
                </span>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-2.5 flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                <path
                  fillRule="evenodd"
                  d="M1.38 8a6.64 6.64 0 0 1 1.027-2.263c.398-.58.887-1.118 1.46-1.572A7.016 7.016 0 0 1 8 2.5a7.016 7.016 0 0 1 4.133 1.665c.573.454 1.062.993 1.46 1.572A6.64 6.64 0 0 1 14.62 8a6.64 6.64 0 0 1-1.027 2.263c-.398.58-.887 1.118-1.46 1.572A7.016 7.016 0 0 1 8 13.5a7.016 7.016 0 0 1-4.133-1.665c-.573-.454-1.062-.993-1.46-1.572A6.64 6.64 0 0 1 1.38 8Z"
                  clipRule="evenodd"
                />
              </svg>
              {options.length} options
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
