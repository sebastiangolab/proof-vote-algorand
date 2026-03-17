import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/votes/[slug]
 *
 * Returns the vote metadata record for the given slug.
 * 
 * Response 200: VoteMetadata (voteId as string)
 * Response 404: not found
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;

  const vote = await prisma.voteMetadata.findUnique({
    where: { slug },
    select: {
      id: true,
      appId: true,
      voteId: true,
      slug: true,
      title: true,
      description: true,
      optionLabels: true,
      creatorWallet: true,
      createdAt: true,
    },
  });

  if (!vote) {
    return NextResponse.json({ error: "Vote not found" }, { status: 404 });
  }

  // BigInt → string for JSON serialisation
  return NextResponse.json({ ...vote, voteId: vote.voteId.toString() });
}
