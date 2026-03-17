import { type VoteState } from "@/lib/algorand";
import { cn } from "@/lib/utils";

type ResultsBarsProps = {
  voteState: VoteState;
  options: string[];
  totalVotes: bigint;
}

function ResultsBars({
  voteState,
  options,
  totalVotes,
}: ResultsBarsProps) {
  const shownCounts = voteState.counts.slice(0, Number(voteState.optionCount));
  const maxCount = shownCounts.reduce((a, b) => (a > b ? a : b), 0n);

  return (
    <div className="space-y-4">
      {options.map((label, optionIndex) => {
        const count = voteState.counts[optionIndex] ?? 0n;
        const percent = totalVotes > 0n ? Math.round(Number((count * 1000n) / totalVotes)) / 10 : 0;
        const isWinner = count === maxCount && maxCount > 0n;

        return (
          <div key={optionIndex}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span
                className={cn(
                  "text-sm font-semibold",
                  isWinner ? "text-indigo-700" : "text-zinc-700"
                )}
              >
                {label}
              </span>
              
              <span className="text-sm text-zinc-600">
                {percent}% <span className="text-xs text-zinc-500">({String(count)})</span>
              </span>
            </div>
            
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isWinner ? "bg-indigo-500" : "bg-zinc-300"
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ResultsBars;