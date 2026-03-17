/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { _store } from "@/lib/rateLimit";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/prisma", () => ({
  prisma: {
    voteMetadata: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/signatures", () => ({
  verifyVoteCreationSignature: jest.fn(),
}));

// Helpers to access mocked functions
import { prisma } from "@/lib/prisma";
import { verifyVoteCreationSignature } from "@/lib/signatures";
const mockCreate = prisma.voteMetadata.create as jest.Mock;
const mockFindMany = prisma.voteMetadata.findMany as jest.Mock;
const mockVerify = verifyVoteCreationSignature as jest.Mock;

// ─── Test data ────────────────────────────────────────────────────────────────

const VALID_BODY = {
  appId: "123456789",
  voteId: "1",
  slug: "test-vote",
  title: "Test Vote",
  optionLabels: ["Yes", "No"],
  creatorWallet: "A".repeat(58),
  signature: "AAAAAAAAAAAAAAAA==",
};

function makeRequest(body?: object, ip = "1.1.1.1"): NextRequest {
  return new NextRequest("http://localhost/api/votes", {
    method: body !== undefined ? "POST" : "GET",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
  });
}

function makeGetRequest(cursor?: string): NextRequest {
  const url = cursor ? `http://localhost/api/votes?cursor=${cursor}` : "http://localhost/api/votes";
  return new NextRequest(url, { method: "GET" });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _store.clear();
  mockVerify.mockReturnValue(true);
});

// ─── GET /api/votes ───────────────────────────────────────────────────────────

describe("GET /api/votes", () => {
  it("returns 20 records and nextCursor when more exist", async () => {
    const records = Array.from({ length: 21 }, (_, i) => ({
      id: `id-${i}`,
      appId: "app",
      voteId: BigInt(i),
      slug: `vote-${i}`,
      title: `Vote ${i}`,
      description: null,
      optionLabels: ["Yes", "No"],
      creatorWallet: "A".repeat(58),
      createdAt: new Date(),

    }));
    mockFindMany.mockResolvedValue(records);

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.votes).toHaveLength(20);
    expect(body.nextCursor).toBe("id-19");
    // voteId serialised as string
    expect(typeof body.votes[0].voteId).toBe("string");
  });

  it("returns null nextCursor when on the last page", async () => {
    const records = Array.from({ length: 5 }, (_, i) => ({
      id: `id-${i}`,
      appId: "app",
      voteId: BigInt(i),
      slug: `vote-${i}`,
      title: `Vote ${i}`,
      description: null,
      optionLabels: ["Yes", "No"],
      creatorWallet: "A".repeat(58),
      createdAt: new Date(),

    }));
    mockFindMany.mockResolvedValue(records);

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(body.votes).toHaveLength(5);
    expect(body.nextCursor).toBeNull();
  });

  it("passes cursor to Prisma when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeGetRequest("some-cursor-id"));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "some-cursor-id" },
        skip: 1,
      })
    );
  });
});

// ─── POST /api/votes — success ────────────────────────────────────────────────

describe("POST /api/votes — success", () => {
  it("returns 201 and calls prisma.create once", async () => {
    const created = {
      id: "new-id",
      ...VALID_BODY,
      voteId: BigInt(1),
      description: null,

      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(created);

    const response = await POST(makeRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(typeof body.voteId).toBe("string");
  });

  it("does not persist the signature field to the DB", async () => {
    const created = {
      id: "x",
      ...VALID_BODY,
      voteId: BigInt(1),
      description: null,

      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(created);

    await POST(makeRequest(VALID_BODY));

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData).not.toHaveProperty("signature");
  });
});

// ─── POST /api/votes — validation errors ─────────────────────────────────────

describe("POST /api/votes — validation errors", () => {
  it("returns 422 when title is missing", async () => {
    const { title: _t, ...noTitle } = VALID_BODY;
    const response = await POST(makeRequest(noTitle));
    expect(response.status).toBe(422);
  });

  it("returns 422 when slug is uppercase", async () => {
    const response = await POST(makeRequest({ ...VALID_BODY, slug: "UPPERCASE" }));
    expect(response.status).toBe(422);
  });

  it("returns 422 when optionLabels has only 1 item", async () => {
    const response = await POST(makeRequest({ ...VALID_BODY, optionLabels: ["Only"] }));
    expect(response.status).toBe(422);
  });
});

// ─── POST /api/votes — signature verification ────────────────────────────────

describe("POST /api/votes — signature verification", () => {
  it("returns 401 when signature verification fails", async () => {
    mockVerify.mockReturnValue(false);
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(401);
  });

  it("does not call prisma.create when signature is invalid", async () => {
    mockVerify.mockReturnValue(false);
    await POST(makeRequest(VALID_BODY));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ─── POST /api/votes — uniqueness ────────────────────────────────────────────

describe("POST /api/votes — uniqueness", () => {
  it("returns 409 when Prisma throws a unique constraint error (P2002)", async () => {
    const prismaError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mockCreate.mockRejectedValue(prismaError);

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(409);
  });
});

// ─── POST /api/votes — rate limiting ─────────────────────────────────────────

describe("POST /api/votes — rate limiting", () => {
  it("returns 429 on the 6th request from the same IP", async () => {
    const created = {
      id: "x",
      ...VALID_BODY,
      voteId: BigInt(1),
      description: null,

      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(created);

    const IP = "9.9.9.9";
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest(VALID_BODY, IP));
      expect(res.status).toBe(201);
    }

    const sixth = await POST(makeRequest(VALID_BODY, IP));
    expect(sixth.status).toBe(429);
  });

  it("includes Retry-After header on 429", async () => {
    const created = {
      id: "x",
      ...VALID_BODY,
      voteId: BigInt(1),
      description: null,

      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(created);

    const IP = "8.8.8.8";
    for (let i = 0; i < 5; i++) await POST(makeRequest(VALID_BODY, IP));

    const response = await POST(makeRequest(VALID_BODY, IP));
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
