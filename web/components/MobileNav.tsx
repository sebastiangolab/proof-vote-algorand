"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ConnectWallet } from "@/components/ConnectWallet";

type MobileNavProps = {
  navLinks?: boolean;
};

export function MobileNav({ navLinks }: MobileNavProps) {
  return (
    <div className="ml-4 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100"
            aria-label="Menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
        </SheetTrigger>

        <SheetContent side="left" className="w-64 px-0 py-0">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-left text-sm font-semibold text-zinc-900">
              Menu
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col py-2">
            {navLinks && (
              <>
                <SheetTrigger asChild>
                  <Link
                    href="/votes"
                    className="px-5 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                  >
                    Votes
                  </Link>
                </SheetTrigger>
                <SheetTrigger asChild>
                  <a
                    href="#how-it-works"
                    className="px-5 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                  >
                    How it works
                  </a>
                </SheetTrigger>
                <SheetTrigger asChild>
                  <a
                    href="#what-you-get"
                    className="px-5 py-3 text-sm text-zinc-800 hover:bg-zinc-50"
                  >
                    What you get
                  </a>
                </SheetTrigger>
                <div className="my-1 border-t border-zinc-100" />
              </>
            )}

            <div className="px-5">
              <ConnectWallet layout="vertical" />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
