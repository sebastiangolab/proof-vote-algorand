export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-zinc-50 px-4 py-12 md:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-2 text-center text-3xl font-bold text-zinc-900">How it works</h2>

        <p className="mb-12 text-center text-zinc-600">
          Three steps to secure, transparent on-chain voting
        </p>

        <div className="grid gap-6 sm:grid-cols-3">
          {/* Step 1 */}
          <div className="relative rounded-2xl bg-white p-8 shadow-sm">
            <div className="absolute right-6 top-6 select-none text-5xl font-black text-zinc-100">
              1
            </div>

            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-indigo-600"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>

            <h3 className="mb-2 font-semibold text-zinc-900">Connect your wallet</h3>

            <p className="text-sm leading-relaxed text-zinc-600">
              Connect Pera or Defly Wallet. Your Algorand address is your identity — no
              registration, no email, no passwords required.
            </p>
          </div>

          {/* Step 2 */}
          <div className="relative rounded-2xl bg-white p-8 shadow-sm">
            <div className="absolute right-6 top-6 select-none text-5xl font-black text-zinc-100">
              2
            </div>

            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-indigo-600"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            </div>

            <h3 className="mb-2 font-semibold text-zinc-900">Vote with stake</h3>

            <p className="text-sm leading-relaxed text-zinc-600">
              Lock a small ALGO stake when casting your vote. The stake prevents duplicate votes
              and spam — every participant has skin in the game.
            </p>
          </div>

          {/* Step 3 */}
          <div className="relative rounded-2xl bg-white p-8 shadow-sm">
            <div className="absolute right-6 top-6 select-none text-5xl font-black text-zinc-100">
              3
            </div>

            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-indigo-600"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
            </div>

            <h3 className="mb-2 font-semibold text-zinc-900">Withdraw your stake</h3>

            <p className="text-sm leading-relaxed text-zinc-600">
              After the vote ends, reclaim your full ALGO stake within the withdrawal window. Miss
              the deadline and the stake is swept to the platform.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
