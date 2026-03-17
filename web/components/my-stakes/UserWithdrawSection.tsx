"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  findUserWithdrawable,
  getAlgodClient,
  MICRO_ALGO,
  type WithdrawTarget,
} from "@/lib/algorand";
import { buildBatchWithdrawAtc } from "@/lib/contract-client";
import { chunkArray, formatDate } from "@/helpers/stakeHelpers";

type UserWithdrawSectionProps = { address: string };

function UserWithdrawSection({ address }: UserWithdrawSectionProps) {
  const { transactionSigner } = useWallet();

  const [isScanning, setIsScanning] = useState(true);
  const [withdrawTargets, setWithdrawTargets] = useState<WithdrawTarget[]>([]);
  const [scanningError, setScanningError] = useState<string | null>(null);

  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawDoneCount, setWithdrawDoneCount] = useState(0);
  const [withdrawTotalCount, setWithdrawTotalCount] = useState(0);
  const [withdrawErrors, setWithdrawErrors] = useState<string[]>([]);
  const [isWithdrawComplete, setIsWithdrawComplete] = useState(false);

  // On mount, find votes where user has withdrawable stake
  useEffect(() => {
    // Use a cancelled flag to avoid setting state after unmount
    let cancelled = false;

    setIsScanning(true);
    setScanningError(null);
    setIsWithdrawComplete(false);

    findUserWithdrawable(address)
      .then((withdrawTargets) => {
        if (!cancelled) setWithdrawTargets(withdrawTargets);
      })
      .catch((error) => {
        if (!cancelled) setScanningError(error instanceof Error ? error.message : "Scan failed");
      })
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  async function handleWithdrawAll() {
    if (!transactionSigner || withdrawTargets.length === 0) return;

    // Batch the withdraw transactions in groups of 16 (Algorand's limit for group size)
    const batches = chunkArray(
      withdrawTargets.map((target) => target.voteId),
      16
    );

    setIsWithdrawing(true);
    setWithdrawDoneCount(0);
    setWithdrawTotalCount(withdrawTargets.length);
    setWithdrawErrors([]);
    setIsWithdrawComplete(false);

    const algod = getAlgodClient();
    const errs: string[] = [];

    for (const batch of batches) {
      try {
        // Build and execute the batch transaction for this group of votes
        const atc = await buildBatchWithdrawAtc({
          voteIds: batch,
          sender: address,
          signer: transactionSigner,
        });

        await atc.execute(algod, 4);

        // If successful, increment the done count by the batch size
        setWithdrawDoneCount((withdrawDoneCount) => withdrawDoneCount + batch.length);
      } catch (err) {
        errs.push(err instanceof Error ? err.message : "Batch failed");
        setWithdrawErrors([...errs]);
      }
    }

    setIsWithdrawing(false);
    setIsWithdrawComplete(true);
  }

  // Calculate total stake across all withdrawTargets for display
  const totalStake = withdrawTargets.reduce((stake, target) => stake + target.stake, 0n);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100">
      <div className="px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Your stakes</p>

        <p className="mt-1 text-sm text-zinc-600">
          Ended votes where your stake is ready to withdraw.
        </p>
      </div>

      {isScanning ? (
        <div className="px-6 py-6 text-sm text-zinc-500">Scanning…</div>
      ) : scanningError ? (
        <div className="px-6 py-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {scanningError}
          </div>
        </div>
      ) : withdrawTargets.length === 0 ? (
        <div className="px-6 py-6 text-sm text-zinc-500">No withdrawable stakes found.</div>
      ) : (
        <>
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-zinc-900">{withdrawTargets.length}</span>

              <span className="ml-2 text-sm text-zinc-500">
                {withdrawTargets.length === 1 ? "vote" : "votes"}
              </span>
            </div>

            <span className="text-sm text-zinc-600">
              {(Number(totalStake) / MICRO_ALGO).toFixed(4)} ALGO total
            </span>
          </div>

          <div className="divide-y divide-zinc-50">
            {withdrawTargets.map((target, targetIndex) => (
              <div key={targetIndex} className="flex items-center justify-between px-6 py-3 text-sm">
                <div>
                  <span className="text-zinc-800 font-medium">Vote #{String(target.voteId)}</span>

                  <span className="ml-3 text-xs text-zinc-500">
                    deadline {formatDate(target.withdrawDeadline)}
                  </span>
                </div>

                <span className="text-zinc-700 font-medium">
                  {(Number(target.stake) / MICRO_ALGO).toFixed(4)} ALGO
                </span>
              </div>
            ))}
          </div>

          {!isWithdrawComplete ? (
            <div className="px-6 py-4 space-y-3">
              {withdrawErrors.map((error, errorIndex) => (
                <div
                  key={errorIndex}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              ))}

              <button
                onClick={handleWithdrawAll}
                disabled={isWithdrawing}
                className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isWithdrawing
                  ? `Withdrawing ${withdrawDoneCount} / ${withdrawTotalCount}…`
                  : `Withdraw all ${withdrawTargets.length} →`}
              </button>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Done — withdrawn {withdrawDoneCount} of {withdrawTotalCount}.
                {withdrawErrors.length > 0 && ` ${withdrawErrors.length} batch(es) failed.`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default UserWithdrawSection;
