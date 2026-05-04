export function WhatYouGetSection() {
  return (
    <section id="what-you-get" className="px-4 py-12 md:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-2 text-center text-3xl font-bold text-zinc-900">What you get</h2>

        <p className="mb-12 text-center text-zinc-600">
          Honest, transparent polling — supported by the Algorand blockchain
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1 — One wallet, one vote */}
          <div className="flex flex-col gap-3 rounded-2xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-indigo-600"
              >
                <path d="M18 16.016c.879.52 1.5 1.342 1.5 2.234 0 1.519-1.79 2.75-4 2.75s-4-1.231-4-2.75c0-.892.621-1.714 1.5-2.234" />
                <path d="M12 12V2l8 4-8 4" />
                <path d="m4 8 8 4" />
                <path d="M4 12v4" />
                <path d="m8 14-4 2 4 2" />
              </svg>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">One wallet, one vote</h3>

              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                Your Algorand address guarantees you can only vote once per poll — fair by design,
                enforced by the blockchain. No fake accounts, no duplicates.
              </p>
            </div>
          </div>

          {/* 2 — No sign-up required */}
          <div className="flex flex-col gap-3 rounded-2xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-indigo-600"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">No sign-up required</h3>

              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                Connect Pera or Defly Wallet and you&apos;re ready to go. No email, no password, no
                personal data stored anywhere.
              </p>
            </div>
          </div>

          {/* 3 — Your stake is refundable */}
          <div className="flex flex-col gap-3 rounded-2xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-indigo-600"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">Your stake is refundable</h3>

              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                The ALGO you lock to vote is returned after the vote ends. Only a small transaction
                fee is non-refundable.
              </p>
            </div>
          </div>

          {/* 4 — Tamper-proof results */}
          <div className="flex flex-col gap-3 rounded-2xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-indigo-600"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">Tamper-proof results</h3>

              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                Vote counts live on the Algorand blockchain. No black box, no central authority —
                results are public and verifiable by anyone.
              </p>
            </div>
          </div>

          {/* 5 — Create a poll in under a minute */}
          <div className="flex flex-col gap-3 rounded-2xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-indigo-600"
              >
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">Create a poll in under a minute</h3>

              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                Anyone with a wallet can create a vote. Set the options, pick a schedule, and
                share the link — that&apos;s it.
              </p>
            </div>
          </div>

          {/* 6 — All your refunds in one place */}
          <div className="flex flex-col gap-3 rounded-2xl border p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-indigo-600"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">All your refunds in one place</h3>

              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                Visit <em>My Refunds</em> to see every ended vote where your ALGO is waiting.
                Withdraw them all with one click.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
