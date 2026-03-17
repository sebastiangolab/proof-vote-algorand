import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { CreateVoteMetadataSchema } from "@/lib/schemas";
import { verifyVoteCreationSignature } from "@/lib/signatures";
import { isPrismaUniqueError } from "@/helpers/apiHelpers";

// Pagination size for GET /api/votes
const PAGE_SIZE = 20;

// ─── GET /api/votes ───────────────────────────────────────────────────────────

/**
 * Returns a paginated list of vote metadata records (newest first).
 *
 * Query params:
 *   cursor — id of the last record from the previous page (optional)
 *
 * Response: { votes: VoteMetadata[], nextCursor: string | null }
 * 
 * Note: voteId (BigInt) is serialized as a string.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;

  const records = await prisma.voteMetadata.findMany({
    // fetch one extra to detect next page
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
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

  const hasMore = records.length > PAGE_SIZE;
  const page = hasMore ? records.slice(0, PAGE_SIZE) : records;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // JSON.stringify doesn't handle BigInt — convert voteId to string
  const votes = page.map((v) => ({ ...v, voteId: v.voteId.toString() }));

  return NextResponse.json({ votes, nextCursor });
}

// ─── POST /api/votes ──────────────────────────────────────────────────────────

/**
 * Creates a new vote (poll) metadata record.
 *
 * Flow: rate limit → Zod validate → verify signature → uniqueness → create
 *
 * Request body: CreateVoteMetadataInput (see lib/schemas.ts)
 * Response 201: created record (voteId as string)
 * Response 422: validation error
 * Response 401: signature verification failed
 * Response 409: duplicate voteId or slug
 * Response 429: rate limit exceeded
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Rate limit — use x-forwarded-for set by Vercel/proxy, fallback to "unknown"
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfter ?? 60) },
      }
    );
  }

  // 2. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateVoteMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // 3. Verify creator's signature over the canonical creation message
  const sigValid = verifyVoteCreationSignature(
    data.voteId,
    data.slug,
    data.creatorWallet,
    data.signature
  );
  
  if (!sigValid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  // 4. Write to DB — catch unique constraint violation (P2002)
  try {
    // signature is not persisted
    const { signature: _sig, ...dbData } = data;

    const created = await prisma.voteMetadata.create({
      data: {
        ...dbData,
        appId: BigInt(data.appId),
        voteId: BigInt(data.voteId),
      },
    });

    // BigInt → string for JSON serialisation
    return NextResponse.json({ ...created, voteId: created.voteId.toString() }, { status: 201 });
  } catch (error) {
    // Prisma unique constraint violation
    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: "Vote with this voteId or slug already exists" },
        { status: 409 }
      );
    }

    throw error;
  }
}