import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VoteDetail } from "@/components/votes/VoteDetail";
import { PageLayout } from "@/components/PageLayout";
import type { Metadata } from "next";

// Next.js 16 dynamic route params are async
type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  const vote = await prisma.voteMetadata.findUnique({
    where: { slug },
    select: { title: true, description: true },
  });

  if (!vote) return { title: "Vote not found — ProofVote" };
  
  return {
    title: `${vote.title} — ProofVote`,
    description: vote.description ?? undefined,
  };
}

export default async function VoteDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const vote = await prisma.voteMetadata.findUnique({
    where: { slug },
    select: {
      voteId: true,
      slug: true,
      title: true,
      description: true,
      optionLabels: true,
      appId: true,
      creatorWallet: true,
    },
  });

  if (!vote) notFound();

  // BigInt → string (JSON-safe and compatible with VoteDetail props)
  const metadata = {
    ...vote,
    voteId: vote.voteId.toString(),
    appId: vote.appId.toString(),
    optionLabels: vote.optionLabels as string[],
  };

  return (
    <PageLayout
      header={{ backHref: "/votes", backLabel: "← All Votes" }}
    >
      <VoteDetail metadata={metadata} />
    </PageLayout>
  );
}
