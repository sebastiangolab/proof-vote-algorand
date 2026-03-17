"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import UserWithdrawSection from "./UserWithdrawSection";
import PlatformSettingsSection from "./PlatformSettingsSection";
import SweepSection from "./SweepSection";

const PLATFORM_OWNER = process.env.NEXT_PUBLIC_PLATFORM_OWNER_ADDRESS ?? "";
const IS_TESTNET = process.env.NEXT_PUBLIC_ALGORAND_NETWORK !== "mainnet";

export function MyStakesPanel() {
  const { activeAddress, transactionSigner } = useWallet();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isOwner = !!activeAddress && (PLATFORM_OWNER === "" || activeAddress === PLATFORM_OWNER);

  if (!mounted || !activeAddress) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center text-zinc-500 text-sm">
        Connect a wallet to view your stakes.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User's own withdrawable stakes */}
      <UserWithdrawSection address={activeAddress} />

      {/* Owner-only: sweep expired stakes */}
      {(isOwner || IS_TESTNET) && transactionSigner && (
        <div className="space-y-4">
          {!isOwner && IS_TESTNET && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Visible on testnet only — this section is restricted to the platform owner on mainnet.
            </div>
          )}

          <PlatformSettingsSection />

          <SweepSection sender={activeAddress} transactionSigner={transactionSigner} />
        </div>
      )}
    </div>
  );
}
