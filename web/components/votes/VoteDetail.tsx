"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchVoteState, fetchUserVoteState, fetchAppConfig, MICRO_ALGO, VOTE_TX_FEE, USER_VOTE_BOX_MBR, type VoteState } from "@/lib/algorand";
import { VoteForm } from "./VoteForm";
import { useWallet } from "@txnlab/use-wallet-react";
import { formatDate, timeLeft } from "@/helpers/votesHelpers";
import StatCard from "./StatCard";
import ResultsBars from "./ResultsBars";
import { cn } from "@/lib/utils";

export type VoteMetadata = {
  voteId: string;
  slug: string;
  title: string;
  description?: string | null;
  optionLabels: string[];
  appId: string;
  creatorWallet: string;
};

type VoteDetailProps = {
  metadata: VoteMetadata;
};

export function VoteDetail({ metadata }: VoteDetailProps) {
  const { activeAddress } = useWallet();

  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [platformOwner, setPlatformOwner] = useState<string | null>(null);
  const [userVoted, setUserVoted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const voteId = BigInt(metadata.voteId);
  const options = metadata.optionLabels;

  // Load vote state and user state (if wallet connected)
  useEffect(() => {
    // To prevent setting state on unmounted component if user navigates away
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const [voteStateData, appConfig] = await Promise.all([
        fetchVoteState(voteId),
        fetchAppConfig(),
      ]);

      if (cancelled) return;

      setVoteState(voteStateData);
      setPlatformOwner(appConfig.platformOwner);

      if (activeAddress && voteStateData) {
        const userVoteState = await fetchUserVoteState(voteId, activeAddress);

        if (!cancelled) setUserVoted(userVoteState?.voted ?? false);
      }

      setIsLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [metadata.voteId, activeAddress]);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isEnded = voteState ? voteState.endAt < now : false;
  const isCreator = !!activeAddress && activeAddress === metadata.creatorWallet;

  // Total votes is the sum of counts for all options (only up to optionCount, since the array has fixed length)
  const totalVotes = voteState
    ? voteState.counts.slice(0, Number(voteState.optionCount)).reduce((a, b) => a + b, 0n)
    : 0n;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          {isLoading ? (
            <Skeleton className="h-6 w-20 rounded-full" />
          ) : voteState ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                isEnded
                  ? "bg-zinc-100 text-zinc-600 ring-zinc-200"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isEnded ? "bg-zinc-400" : "bg-emerald-500 animate-pulse"
                )}
              />

              {isEnded ? "Ended" : "Active"}
            </span>
          ) : null}
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{metadata.title}</h1>

        {metadata.description && (
          <p className="mt-2 text-base leading-relaxed text-zinc-600">{metadata.description}</p>
        )}
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        voteState && (
          <div className={`grid gap-3 grid-cols-2`}>
            <StatCard
              label="Total votes"
              value={String(totalVotes)}
              sub={`across ${options.length} options`}
            />

            <StatCard
              label={!isEnded ? "Time remaining" : "Ended"}
              value={timeLeft(voteState.endAt)}
              sub={formatDate(voteState.endAt)}
            />

            {!isEnded && (
              <>
                <StatCard label="Tx fee" value={`${Number(VOTE_TX_FEE) / MICRO_ALGO} ALGO`} sub="non-refundable" />
                
                <StatCard
                  label="Deposit"
                  value={`${(Number(voteState.stake) + Number(USER_VOTE_BOX_MBR)) / MICRO_ALGO} ALGO`}
                  sub="refundable (stake + storage)"
                />
              </>
            )}
          </div>
        )
      )}

      {/* ── Main card: form or results ─────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        voteState && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            {!isEnded ? (
              <>
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cast your vote
                </p>

                <VoteForm
                  voteId={voteId}
                  options={options}
                  stake={voteState.stake}
                  disabled={userVoted || isCreator}
                  disabledReason={
                    isCreator
                      ? "Poll creators cannot vote on their own polls."
                      : userVoted
                        ? "You have already voted."
                        : undefined
                  }
                />
              </>
            ) : (
              <>
                <p className="mb-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Results
                </p>

                <ResultsBars voteState={voteState} options={options} totalVotes={totalVotes} />
              </>
            )}
          </div>
        )
      )}

      {/* ── Data unavailable ─────────────────────────────────────────── */}
      {!isLoading && !voteState && (
        <p className="text-sm text-zinc-500">On-chain data unavailable.</p>
      )}

      {/* ── Withdraw warning ─────────────────────────────────────────── */}
      {voteState && isEnded && userVoted && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
          <span className="mt-0.5 shrink-0">⚠</span>      

          <span>
            Withdraw before <strong>{formatDate(voteState.withdrawDeadline)}</strong> or your refund
            goes to{" "}
            <span className="font-mono text-xs">
              {platformOwner ? `${platformOwner.slice(0, 8)}…${platformOwner.slice(-4)}` : "the platform"}
            </span>
            .
          </span>
        </div>
      )}
    </div>
  );
}
