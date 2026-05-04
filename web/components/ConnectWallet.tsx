"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useWallet } from "@txnlab/use-wallet-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ConnectWalletProps = {
  /** "horizontal" (default) for the site header; "vertical" for the mobile drawer. */
  layout?: "horizontal" | "vertical";
};

export function ConnectWallet({ layout = "horizontal" }: ConnectWalletProps) {
  const { wallets, activeAddress, activeWallet } = useWallet();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    
    return () => document.removeEventListener("mousedown", handleClick);
  }, [accountMenuOpen]);

  useEffect(() => { setMounted(true); }, []);

  if (mounted && activeAddress) {
    const isVertical = layout === "vertical";
    const accounts = activeWallet?.accounts ?? [];
    const hasMultipleAccounts = accounts.length > 1;

    const addressDisplay = (addr: string, short = false) =>
      `${addr.slice(0, short ? 6 : 8)}…${addr.slice(-4)}`;

    return (
      <div className={isVertical ? "flex flex-col" : "flex items-center gap-3"}>
        {/* Account selector */}
        <div className={cn("relative", isVertical && "py-1")} ref={menuRef}>
          <button
            onClick={() => hasMultipleAccounts && setAccountMenuOpen((v) => !v)}
            className={cn(
              "flex items-center gap-2",
              hasMultipleAccounts && "cursor-pointer hover:opacity-80",
              isVertical && "py-2"
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
            <span className={cn("font-mono truncate", isVertical ? "text-xs text-zinc-600" : "text-sm text-zinc-800")}>
              {addressDisplay(activeAddress, !isVertical)}
            </span>
            {hasMultipleAccounts && (
              <span className="text-xs text-zinc-400">{accountMenuOpen ? "▲" : "▼"}</span>
            )}
          </button>

          {accountMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              {accounts.map((account) => (
                <button
                  key={account.address}
                  onClick={() => {
                    activeWallet?.setActiveAccount(account.address);
                    setAccountMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-zinc-50",
                    account.address === activeAddress && "font-semibold text-indigo-600"
                  )}
                >
                  <span className="font-mono">{addressDisplay(account.address)}</span>
                  {account.address === activeAddress && (
                    <span className="ml-auto text-xs text-indigo-400">active</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {isVertical && <div className="mb-1 border-t border-zinc-100" />}

        <Button asChild variant="ghost" size="sm" className={cn(isVertical ? "justify-start px-0" : "hidden md:inline-flex")}>
          <Link href="/my-refunds">My Refunds</Link>
        </Button>

        <Button
          variant={isVertical ? "ghost" : "outline"}
          size="sm"
          className={cn(isVertical ? "justify-start px-0 text-red-600 hover:text-red-600" : "hidden md:inline-flex")}
          onClick={() => activeWallet?.disconnect()}
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Connect Wallet
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect a wallet</DialogTitle>
          </DialogHeader>

          <div className="mt-2 flex flex-col gap-2">
            {wallets.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => { wallet.connect(); setOpen(false); }}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50"
              >
                {wallet.metadata.icon && (
                  <img src={wallet.metadata.icon} alt={wallet.metadata.name} className="h-8 w-8 rounded-lg object-contain" />
                )}
                
                <span className="text-sm font-medium text-zinc-900">{wallet.metadata.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
