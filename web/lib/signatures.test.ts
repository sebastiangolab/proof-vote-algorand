import algosdk from "algosdk";
import { buildCreationMessage, verifyVoteCreationSignature } from "./signatures";

// ─── buildCreationMessage ─────────────────────────────────────────────────────

describe("buildCreationMessage", () => {
  it("produces the expected canonical format", () => {
    const msg = buildCreationMessage("42", "my-vote");
    expect(msg).toBe("ProofVote: create metadata for voteId=42 slug=my-vote");
  });

  it("includes both parameters in the message", () => {
    const msg = buildCreationMessage("1", "alpha-poll");
    expect(msg).toContain("voteId=1");
    expect(msg).toContain("slug=alpha-poll");
  });
});

// ─── verifyVoteCreationSignature ──────────────────────────────────────────────

describe("verifyVoteCreationSignature", () => {
  // Generate a fresh account for each test suite run
  const account = algosdk.generateAccount();
  const address = account.addr.toString();

  // Sign the canonical message for voteId=1, "test-slug"
  const voteId = "1";
  const slug = "test-slug";
  const message = buildCreationMessage(voteId, slug);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = algosdk.signBytes(msgBytes, account.sk);
  const signature = Buffer.from(sigBytes).toString("base64");

  it("returns true for a valid signature", () => {
    expect(verifyVoteCreationSignature(voteId, slug, address, signature)).toBe(true);
  });

  it("returns false when voteId is different from what was signed", () => {
    expect(verifyVoteCreationSignature("99", slug, address, signature)).toBe(false);
  });

  it("returns false when slug is different from what was signed", () => {
    expect(verifyVoteCreationSignature(voteId, "different-slug", address, signature)).toBe(false);
  });

  it("returns false for a wrong address (different key)", () => {
    const otherAccount = algosdk.generateAccount();
    expect(
      verifyVoteCreationSignature(voteId, slug, otherAccount.addr.toString(), signature)
    ).toBe(false);
  });

  it("returns false for an invalid base64 signature", () => {
    expect(verifyVoteCreationSignature(voteId, slug, address, "not-valid-sig!!")).toBe(false);
  });

  it("returns false for a tampered (truncated) signature", () => {
    const truncated = signature.slice(0, 10);
    expect(verifyVoteCreationSignature(voteId, slug, address, truncated)).toBe(false);
  });

  it("returns false for an invalid Algorand address", () => {
    expect(verifyVoteCreationSignature(voteId, slug, "NOTANADDRESS", signature)).toBe(false);
  });
});
