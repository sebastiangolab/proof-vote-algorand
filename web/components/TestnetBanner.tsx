"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const isTestnet = process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "testnet";

export function TestnetBanner() {
  if (!isTestnet) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="mx-auto max-w-5xl text-center text-xs text-amber-800">
        <span className="font-semibold">Testnet only</span> — you need testnet ALGO to participate.{" "}
        <Dialog>
          <DialogTrigger className="underline underline-offset-2 hover:text-amber-900">
            How to get started →
          </DialogTrigger>

          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Getting started on Testnet</DialogTitle>
              <DialogDescription>How to get free testnet ALGO and configure your wallet.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 text-sm text-zinc-700">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-2">
                <p className="font-semibold text-zinc-800">1. Get free testnet ALGO</p>

                <p>
                  Visit the{" "}
                  <a
                    href="https://bank.testnet.algorand.network/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
                  >
                    Algorand Testnet Faucet
                  </a>
                  , paste your wallet address and dispense free ALGO.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-3">
                <p className="font-semibold text-zinc-800">2. Switch your wallet to Testnet</p>

                <div>
                  <p className="font-medium text-zinc-800">Pera Wallet</p>

                  <ol className="mt-1 list-decimal list-inside space-y-0.5 text-zinc-600">
                    <li>Open Pera, open menu and tap the settings icon (⚙)</li>

                    <li>
                      Go to <span className="font-medium">Developer Settings</span>
                    </li>

                    <li>
                      Set <span className="font-medium">Node Settings</span> to <span className="font-medium">TestNet</span>
                    </li>
                  </ol>
                </div>

                <div>
                  <p className="font-medium text-zinc-800">Defly Wallet</p>

                  <ol className="mt-1 list-decimal list-inside space-y-0.5 text-zinc-600">
                    <li>Open Defly and open more options in the navigation menu</li>

                    <li>
                      Go to <span className="font-medium">Preferences → Advanced</span>
                    </li>
                    
                    <li>
                      Set <span className="font-medium">Developer Mode</span> to enabled and restart the app
                    </li>
                  </ol>
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                Testnet ALGO has no real value — it is safe to experiment freely.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </p>
    </div>
  );
}
