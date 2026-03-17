import { prisma } from "@/lib/prisma";
import { VoteList } from "@/components/votes/VoteList";
import { PageLayout } from "@/components/PageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All Votes — ProofVote",
};

export default async function VotesPage() {
  const voteRecords = await prisma.voteMetadata.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      description: true,
      optionLabels: true,
      createdAt: true,
    },
  });

  return (
    <PageLayout mainClassName="max-w-4xl px-4 py-8 pb-16">
      <VoteList records={voteRecords} />
    </PageLayout>
  );
}
