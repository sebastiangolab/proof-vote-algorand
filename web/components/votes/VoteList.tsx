"use client";

import { useState } from "react";
import Link from "next/link";
import { VoteRow, type VoteRowData } from "@/components/votes/VoteRow";

type Tab = "all" | "active" | "ended";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "ended", label: "Ended" },
];

export function VoteList({ records }: { records: VoteRowData[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = records
    .filter((record) => {
      const matchesQuery = record.title.toLowerCase().includes(query.toLowerCase());
      const status = record.status ?? "active";
      const matchesTab = tab === "all" || status === tab;

      return matchesQuery && matchesTab;
    })
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      return sortAsc ? timeA - timeB : timeB - timeA;
    });

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>

        <input
          type="text"
          placeholder="Search votes..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-zinc-500 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <hr className="mb-4 border-zinc-200" />

      {/* Mobile: New Vote button at top */}
      <Link
        href="/create-poll"
        className="mb-5 flex h-10 items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 sm:hidden"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
        </svg>
        New Vote
      </Link>

      {/* Tabs + controls row */}
      <div className="mb-4 flex items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === tabItem.id
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800"
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSortAsc((value) => !value)}
            className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 2 11.25Z"
                clipRule="evenodd"
              />
            </svg>
            {sortAsc ? "Oldest first" : "Newest first"}
          </button>

          <span className="text-xs text-zinc-500">{filtered.length} total</span>

          <Link
            href="/create-poll"
            className="hidden h-8 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 sm:flex"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            New Vote
          </Link>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-zinc-500">No votes found.</p>
        ) : (
          filtered.map((vote) => <VoteRow key={vote.slug} vote={vote} />)
        )}
      </div>
    </div>
  );
}
