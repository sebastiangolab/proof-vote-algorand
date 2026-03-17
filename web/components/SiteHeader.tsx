import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { MobileNav } from "@/components/MobileNav";
import { cn } from "@/lib/utils";

export type SiteHeaderProps = {
  /** If provided, shows a back link on the left instead of the ProofVote logo */
  backHref?: string;
  backLabel?: string;
  /** Optional button/actionElement rendered to the right */
  actionElement?: React.ReactNode;
  /** Render centered nav links */
  navLinks?: boolean;
  /** Sticky positioning with backdrop blur */
  sticky?: boolean;
  /** Use max-w-5xl instead of the default max-w-4xl */
  wide?: boolean;
};

// Determine logo text based on network (mainnet vs testnet)
// to avoid confusion for users testing on testnet.
const isTestnet = process.env.NEXT_PUBLIC_ALGORAND_NETWORK !== "mainnet";
const logoText = isTestnet ? "ProofVote (Demo)" : "ProofVote";

/**
 * Shared site header used across all pages.
 */
export function SiteHeader({
  backHref,
  backLabel = "← Back",
  actionElement,
  navLinks,
  sticky,
  wide,
}: SiteHeaderProps) {
  let logoElement: React.ReactNode = (
    <Link href="/" className="font-semibold text-zinc-800">
      {logoText}
    </Link>
  );

  if (navLinks) {
    logoElement = <span className="font-bold text-zinc-900">{logoText}</span>;
  }

  if (backHref) {
    logoElement = (
      <Link href={backHref} className="font-semibold text-zinc-800">
        {backLabel}
      </Link>
    );
  }

  const stickyClasses = sticky ? "sticky top-0 z-10 bg-white/90 backdrop-blur" : "bg-white";
  const maxWidthClass = wide ? "max-w-5xl" : "max-w-4xl";

  return (
    <header className={`border-b ${stickyClasses}`}>
      <div className={cn("mx-auto flex items-center px-4 py-3 justify-between", maxWidthClass)}>
        {logoElement}

        {navLinks && (
          <nav className="hidden items-center gap-6 md:flex mx-auto">
            <Link
              href="/votes"
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Votes
            </Link>

            <a
              href="#how-it-works"
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              How it works
            </a>

            <a
              href="#what-you-get"
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              What you get
            </a>
          </nav>
        )}

        <div className="items-center gap-4 flex">
          <ConnectWallet />

          {actionElement}

          <MobileNav navLinks={navLinks} />
        </div>
      </div>
    </header>
  );
}
