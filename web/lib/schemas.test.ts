import { CreateVoteMetadataSchema } from "./schemas";

// Minimal valid input — use this as a base and override per-test
const VALID_INPUT = {
  appId: "123456789",
  voteId: "1",
  slug: "my-first-vote",
  title: "Should we adopt the new proposal?",
  optionLabels: ["Yes", "No"],
  creatorWallet: "A".repeat(58), // 58-char placeholder (format only; not a real address)
  signature: "AAAAAAAAAAAAAAAA==",
};

function parse(overrides: object) {
  return CreateVoteMetadataSchema.safeParse({ ...VALID_INPUT, ...overrides });
}

// ─── Valid input ──────────────────────────────────────────────────────────────

describe("CreateVoteMetadataSchema — valid input", () => {
  it("accepts a fully valid payload", () => {
    const result = CreateVoteMetadataSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("accepts 8 options (maximum)", () => {
    const result = parse({ optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"] });
    expect(result.success).toBe(true);
  });

  it("accepts optional description", () => {
    const result = parse({ description: "Detailed description" });
    expect(result.success).toBe(true);
  });
});

// ─── Slug validation ──────────────────────────────────────────────────────────

describe("CreateVoteMetadataSchema — slug validation", () => {
  it("rejects an uppercase slug", () => {
    const result = parse({ slug: "MY-VOTE" });
    expect(result.success).toBe(false);
  });

  it("rejects a slug with spaces", () => {
    const result = parse({ slug: "my vote" });
    expect(result.success).toBe(false);
  });

  it("rejects a slug shorter than 3 characters", () => {
    const result = parse({ slug: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects a slug longer than 60 characters", () => {
    const result = parse({ slug: "a".repeat(61) });
    expect(result.success).toBe(false);
  });

  it("accepts a slug with numbers and dashes", () => {
    const result = parse({ slug: "vote-2025-01" });
    expect(result.success).toBe(true);
  });
});

// ─── optionLabels validation ──────────────────────────────────────────────────

describe("CreateVoteMetadataSchema — optionLabels validation", () => {
  it("rejects 9 options (above maximum)", () => {
    const result = parse({ optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H", "I"] });
    expect(result.success).toBe(false);
  });

  it("rejects 1 option (below minimum)", () => {
    const result = parse({ optionLabels: ["Only one"] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty option label", () => {
    const result = parse({ optionLabels: ["Yes", ""] });
    expect(result.success).toBe(false);
  });
});

// ─── Other field validation ───────────────────────────────────────────────────

describe("CreateVoteMetadataSchema — other fields", () => {
  it("rejects a missing title", () => {
    const { title: _title, ...withoutTitle } = VALID_INPUT;
    const result = CreateVoteMetadataSchema.safeParse(withoutTitle);
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric voteId", () => {
    const result = parse({ voteId: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing signature", () => {
    const { signature: _sig, ...withoutSig } = VALID_INPUT;
    const result = CreateVoteMetadataSchema.safeParse(withoutSig);
    expect(result.success).toBe(false);
  });
});
