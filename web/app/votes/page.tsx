import { prisma } from "@/lib/prisma";
import { VoteList } from "@/components/votes/VoteList";
import { PageLayout } from "@/components/PageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All Votes — ProofVote",
};

export default async function VotesPage() {
  const rows = await prisma.voteMetadata.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      description: true,
      optionLabels: true,
      endAt: true,
      createdAt: true,
    },
  });

  // Determine status of each vote based on endAt —  
  // "active" if endAt is in the future or not set,
  // "ended" if endAt is in the past. 
  const now = Math.floor(Date.now() / 1000);

  const voteRecords = rows.map((row) => ({
    ...row,
    status: (row.endAt && row.endAt < now ? "ended" : "active") as "active" | "ended",
  }));

  return (
    <PageLayout mainClassName="max-w-4xl px-4 py-8 pb-16">
      <VoteList records={voteRecords} />
    </PageLayout>
  );
}
