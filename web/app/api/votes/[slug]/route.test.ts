/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { GET } from "./route";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/prisma", () => ({
  prisma: {
    voteMetadata: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
const mockFindUnique = prisma.voteMetadata.findUnique as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(slug: string): NextRequest {
  return new NextRequest(`http://localhost/api/votes/${slug}`, { method: "GET" });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /api/votes/[slug] ────────────────────────────────────────────────────

describe("GET /api/votes/[slug]", () => {
  const SAMPLE_VOTE = {
    id: "abc-123",
    appId: "111",
    voteId: BigInt(42),
    slug: "my-vote",
    title: "My Vote",
    description: "A great vote",
    optionLabels: ["Yes", "No"],
    creatorWallet: "A".repeat(58),
    createdAt: new Date("2025-01-01T00:00:00Z"),

  };

  it("returns 200 with the vote record when slug is found", async () => {
    mockFindUnique.mockResolvedValue(SAMPLE_VOTE);

    const response = await GET(makeRequest("my-vote"), makeParams("my-vote"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slug).toBe("my-vote");
    expect(body.title).toBe("My Vote");
  });

  it("serializes voteId as a string", async () => {
    mockFindUnique.mockResolvedValue(SAMPLE_VOTE);

    const response = await GET(makeRequest("my-vote"), makeParams("my-vote"));
    const body = await response.json();

    expect(typeof body.voteId).toBe("string");
    expect(body.voteId).toBe("42");
  });

  it("queries Prisma with the correct slug", async () => {
    mockFindUnique.mockResolvedValue(SAMPLE_VOTE);

    await GET(makeRequest("my-vote"), makeParams("my-vote"));

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "my-vote" } })
    );
  });

  it("returns 404 when slug is not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const response = await GET(makeRequest("nonexistent"), makeParams("nonexistent"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
  });
});
