"use client";

import {
  WalletProvider as UseWalletProvider,
  WalletManager,
  WalletId,
  NetworkId,
} from "@txnlab/use-wallet-react";
import React from "react";

// WalletManager is initialised once at module load (singleton)
// – do NOT recreate on every render, or wallet state is lost on re-mount
// For localnet development, we use KMD for signing (since it supports signData) 
// and skip signature verification in the backend.
const isLocalnet = process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "localnet";

const manager = new WalletManager({
  wallets: isLocalnet
    ? [
        {
          id: WalletId.KMD,
          options: {
            token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            baseServer: "http://localhost:3000/kmd",
            port: 3000,
            wallet: "unencrypted-default-wallet",
            promptForPassword: () => Promise.resolve(""),
          },
        },
      ]
    : [WalletId.PERA, WalletId.DEFLY],
  defaultNetwork:
    process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "mainnet"
      ? NetworkId.MAINNET
      : process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "localnet"
        ? NetworkId.LOCALNET
        : NetworkId.TESTNET,
});

/**
 * Root wallet context provider.
 * Wraps the app in UseWallet's context so any child can call useWallet().
 * Must be rendered inside a Client Component boundary.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return <UseWalletProvider manager={manager}>{children}</UseWalletProvider>;
}
