"use client";

import { useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { getAlgodClient, MICRO_ALGO, VOTE_TX_FEE, USER_VOTE_BOX_MBR } from "@/lib/algorand";
import { buildVoteAtc } from "@/lib/contract-client";
import { cn } from "@/lib/utils";

type Props = {
  voteId: bigint;
  options: string[];
  stake: bigint;
  disabled?: boolean;
  disabledReason?: string;
};

export function VoteForm({ voteId, options, stake, disabled, disabledReason }: Props) {
  const { activeAddress, transactionSigner } = useWallet();

  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleVote() {
    if (selected === null || !activeAddress || !transactionSigner) return;

    setSubmitting(true);
    setError(null);

    const algod = getAlgodClient();
    const choice = BigInt(selected);

    async function castVote() {
      const atc = await buildVoteAtc({ sender: activeAddress!, voteId, choice, stake, signer: transactionSigner! });
      await atc.execute(algod, 4);
    }

    try {
      await castVote();
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Voting failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">Vote submitted!</p>

        <p className="mt-1 text-sm text-emerald-700">
          You can withdraw your refund after the vote ends.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {disabledReason && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {disabledReason}
        </div>
      )}

      <div className="space-y-2">
        {options.map((label, optionIndex) => (
          <button
            key={optionIndex}
            onClick={() => !disabled && setSelected(optionIndex)}
            disabled={disabled}
            className={cn(
              "w-full rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-all duration-150",
              selected === optionIndex
                ? "border-indigo-500 bg-indigo-50 text-indigo-900 shadow-sm"
                : disabled
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-500"
                  : "cursor-pointer border-zinc-200 bg-white text-zinc-800 hover:border-indigo-300 hover:bg-indigo-50/40"
            )}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  selected === optionIndex ? "border-indigo-500 bg-indigo-500" : "border-zinc-300"
                )}
              >
                {selected === optionIndex && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Cost breakdown */}
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 space-y-0.5">
        <div className="flex justify-between">
          <span>Stake (refundable)</span>
          <span className="font-medium text-zinc-800">{Number(stake) / MICRO_ALGO} ALGO</span>
        </div>

        <div className="flex justify-between">
          <span>Storage deposit (refundable)</span>
          <span className="font-medium text-zinc-800">{Number(USER_VOTE_BOX_MBR) / MICRO_ALGO} ALGO</span>
        </div>

        <div className="flex justify-between">
          <span>Tx fees (non-refundable)</span>
          <span className="font-medium text-zinc-800">{Number(VOTE_TX_FEE) / MICRO_ALGO} ALGO</span>
        </div>

        <div className="flex justify-between border-t border-zinc-200 pt-1 mt-1 text-zinc-900">
          <span className="font-semibold">Total</span>
          <span className="font-bold">
            {((Number(stake) + Number(USER_VOTE_BOX_MBR) + Number(VOTE_TX_FEE)) / MICRO_ALGO).toFixed(4)} ALGO
          </span>
        </div>
      </div>

      {!activeAddress && <p className="text-sm text-zinc-500">Connect a wallet to vote.</p>}

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <button
        onClick={handleVote}
        disabled={disabled || selected === null || !activeAddress || submitting}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Submitting…" : "Submit Vote →"}
      </button>
    </div>
  );
}
