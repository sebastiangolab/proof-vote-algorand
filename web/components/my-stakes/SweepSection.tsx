"use client";

import { useState } from "react";
import type algosdk from "algosdk";
import {
  findEligibleSweeps,
  getAlgodClient,
  MICRO_ALGO,
  SWEEP_USER_TX_FEE,
  type SweepTarget,
} from "@/lib/algorand";
import { buildBatchSweepAtc, advanceLocalnetPast } from "@/lib/contract-client";
import { chunkArray, shortAddr } from "@/helpers/stakeHelpers";

type SweepSectionProps = {
  sender: string;
  transactionSigner: algosdk.TransactionSigner;
}

function SweepSection({
  sender,
  transactionSigner,
}: SweepSectionProps) {
  const [isScanning, setScanning] = useState(false);
  const [sweepTargets, setTargets] = useState<SweepTarget[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [isSweeping, setSweeping] = useState(false);
  const [sweepDoneCount, setDone] = useState(0);
  const [sweepTotalCount, setSweepTotalCount] = useState(0);
  const [sweepErrors, setSweepErrors] = useState<string[]>([]);
  const [isSweepComplete, setIsSweepComplete] = useState(false);

  async function handleScan() {
    setScanning(true);
    setScanError(null);
    setTargets(null);
    setIsSweepComplete(false);
    setSweepErrors([]);

    try {
      setTargets(await findEligibleSweeps());
    } catch (err) {
      console.error(err);
      setScanError("Coś poszło nie tak, spróbuj jeszcze raz.");
    } finally {
      setScanning(false);
    }
  }

  async function handleSweepAll() {
    if (!sweepTargets || sweepTargets.length === 0) return;

    // Batch the sweep transactions in groups of 16 (Algorand's limit for group size)
    const batches = chunkArray(sweepTargets, 16);

    setSweeping(true);
    setDone(0);
    setSweepTotalCount(sweepTargets.length);
    setSweepErrors([]);
    setIsSweepComplete(false);

    const algod = getAlgodClient();
    const errs: string[] = [];

    // On localnet blocks only increment ~1s per block from genesis, so
    // latestTimestamp can lag far behind wall clock. Advance past current
    // wall clock (scanner already verified withdrawDeadline < now for all targets).
    // advanceLocalnetPast resets the offset after mining so createVote is unaffected.
    if (process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "localnet") {
      const now = BigInt(Math.floor(Date.now() / 1000));
      await advanceLocalnetPast(now, sender, transactionSigner);
    }

    for (const batch of batches) {
      try {
        const atc = await buildBatchSweepAtc({ targets: batch, sender, signer: transactionSigner });
        await atc.execute(algod, 4);
        setDone((d) => d + batch.length);
      } catch (err) {
        console.error(err);
        errs.push("Coś poszło nie tak, spróbuj jeszcze raz.");
        setSweepErrors([...errs]);
      }
    }

    setSweeping(false);
    setIsSweepComplete(true);

    // Re-scan to remove successfully swept targets from the list
    findEligibleSweeps().then(setTargets).catch(() => {});
  }

  const totalStake = sweepTargets ? sweepTargets.reduce((s, t) => s + t.stake, 0n) : 0n;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Expired stakes (sweep)
          </p>

          <p className="mt-1 text-sm text-zinc-600">
            Users whose withdraw deadline has passed — stake goes to the platform.
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isScanning ? "Scanning…" : "Scan for expired stakes"}
        </button>

        {scanError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {scanError}
          </div>
        )}
      </div>

      {sweepTargets !== null && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-zinc-900">{sweepTargets.length}</span>

              <span className="ml-2 text-sm text-zinc-500">
                {sweepTargets.length === 1 ? "address" : "addresses"} eligible
              </span>
            </div>

            {sweepTargets.length > 0 && (
              <span className="text-sm text-zinc-600">
                {(Number(totalStake) / MICRO_ALGO).toFixed(4)} ALGO total
              </span>
            )}
          </div>

          {sweepTargets.length > 0 && (
            <div className="divide-y divide-zinc-50">
              {sweepTargets.map((target, targetIndex) => (
                <div key={targetIndex} className="flex items-center justify-between px-6 py-3 text-sm">
                  <div>
                    <span className="font-mono text-zinc-800">{shortAddr(target.userAddress)}</span>

                    <span className="ml-3 text-xs text-zinc-500">vote #{String(target.voteId)}</span>
                  </div>

                  <span className="text-zinc-700 font-medium">
                    {(Number(target.stake) / MICRO_ALGO).toFixed(4)} ALGO
                  </span>
                </div>
              ))}
            </div>
          )}

          {sweepTargets.length > 0 && !isSweepComplete && (
            <div className="px-6 py-4 space-y-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Fee:{" "}
                <span className="font-semibold">
                  {Number(SWEEP_USER_TX_FEE * BigInt(sweepTargets.length)) / MICRO_ALGO} ALGO
                </span>
                {" "}({sweepTargets.length} × {Number(SWEEP_USER_TX_FEE) / MICRO_ALGO} ALGO fee)
              </div>

              {sweepErrors.map((error, errorIndex) => (
                <div
                  key={errorIndex}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              ))}
              
              <button
                onClick={handleSweepAll}
                disabled={isSweeping}
                className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSweeping ? `Sweeping ${sweepDoneCount} / ${sweepTotalCount}…` : `Sweep all ${sweepTargets.length} →`}
              </button>
            </div>
          )}

          {isSweepComplete && (
            <div className="px-6 py-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Done — swept {sweepDoneCount} of {sweepTotalCount}.
                {sweepErrors.length > 0 && ` ${sweepErrors.length} batch(es) failed.`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SweepSection