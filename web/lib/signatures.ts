import algosdk from "algosdk";

/**
 * Builds the canonical message that a vote creator must sign before
 * submitting metadata to the API.
 *
 * Format: `ProofVote: create metadata for appId=A voteId=N slug=Y`
 *
 * Including appId binds the signature to a specific contract deployment,
 * preventing cross-deployment replay attacks.
 *
 * @param appId  - Contract application ID (numeric string)
 * @param voteId - Vote ID from the contract (numeric string or bigint string)
 * @param slug   - URL slug chosen for the vote
 * @returns Canonical message string
 */
export function buildCreationMessage(appId: string, voteId: string, slug: string): string {
  return `ProofVote: create metadata for appId=${appId} voteId=${voteId} slug=${slug}`;
}

/**
 * Verifies that `address` signed the canonical creation message for the given vote.
 *
 * Uses `algosdk.verifyBytes` which internally prepends "MX" for domain separation
 * (prevents reuse of vote transaction signatures).
 *
 * @param appId     - Contract application ID (as string, matching what was signed)
 * @param voteId    - Vote ID (as string, matching what was signed)
 * @param slug      - Vote slug
 * @param address   - Signer's Algorand address (58-char base32)
 * @param signature - Base64-encoded signature bytes produced by `algosdk.signBytes`
 * @returns `true` if the signature is valid for the given parameters, `false` otherwise
 */
export function verifyVoteCreationSignature(
  appId: string,
  voteId: string,
  slug: string,
  address: string,
  signature: string
): boolean {
  try {
    // Reconstruct the original message that was signed
    const message = buildCreationMessage(appId, voteId, slug);

    // Encode message to bytes (UTF-8)
    const msgBytes = new TextEncoder().encode(message);

    // Decode base64 signature to bytes
    const sigBytes = new Uint8Array(Buffer.from(signature, "base64"));

    // In algosdk v3, verifyBytes(bytes, sig, addr) accepts the address string directly.
    // It internally prepends "MX" for domain separation before verifying.
    return algosdk.verifyBytes(msgBytes, sigBytes, address);
  } catch {
    // Invalid address or malformed signature → treat as verification failure
    return false;
  }
}
