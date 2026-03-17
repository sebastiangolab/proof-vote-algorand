import Link from "next/link";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white px-4 py-12 md:py-20">
      {/* Subtle dot pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-indigo-50 via-white to-white" />

      <div className="relative mx-auto max-w-5xl">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Left: text */}
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
              <span className="text-xs font-medium text-indigo-600">Built on Algorand</span>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
              Blockchain <span className="text-indigo-600">Voting</span>
              <br />
              on Algorand
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-zinc-600">
              Every vote is backed by a refundable ALGO stake — preventing spam, ensuring
              accountability, and putting governance on-chain where it belongs. One wallet. One
              vote. Full transparency.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="border-0 bg-indigo-600 text-white hover:bg-indigo-500"
              >
                <Link href="/votes">Browse Votes</Link>
              </Button>

              <Button asChild size="lg" variant="outline">
                <Link href="/create-poll">Create a Vote</Link>
              </Button>
            </div>
          </div>

          {/* Right: floating vote card mockup */}
          <div className="hidden justify-center md:flex">
            <div className="w-80 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/80">
              <p className="mb-3 text-sm font-semibold text-zinc-900">Q3 Protocol Upgrade</p>

              <p className="mb-4 text-xs text-zinc-600">
                Should we upgrade the consensus layer to v2.4? Required stake: 1 ALGO
              </p>

              <div className="space-y-2">
                {["Yes, upgrade now", "No, wait for audit", "Abstain"].map(
                  (option, optionIndex) => (
                    <div
                      key={optionIndex}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        optionIndex === 0 ? "border-indigo-400 bg-indigo-50" : "border-zinc-200"
                      }`}
                    >
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          optionIndex === 0 ? "border-indigo-500" : "border-zinc-300"
                        }`}
                      >
                        {optionIndex === 0 && (
                          <div className="h-2 w-2 rounded-full bg-indigo-500" />
                        )}
                      </div>

                      <span
                        className={`text-sm ${optionIndex === 0 ? "font-medium text-indigo-700" : "text-zinc-600"}`}
                      >
                        {option}
                      </span>
                    </div>
                  )
                )}
              </div>

              <div className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white">
                Submit Vote
              </div>

              <p className="mt-2 text-center text-xs text-zinc-500">
                Stake returned after the vote ends
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
