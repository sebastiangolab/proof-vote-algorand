import algosdk from "algosdk";

/**
 * Verifies that `creatorWallet` signed the canonical creation message by checking
 * a 0-ALGO self-payment transaction whose `note` field contains the message.
 *
 * Used as a fallback for wallets (e.g. Defly) that do not support ARC-0060 signData.
 * The transaction is never submitted to the network — it serves only as a signing primitive.
 *
 * @param appId           - Contract application ID (as string)
 * @param voteId          - Vote ID (as string)
 * @param slug            - Vote slug
 * @param creatorWallet   - Expected signer's Algorand address (58-char base32)
 * @param signedTxnBase64 - Base64-encoded msgpack signed transaction bytes
 * @returns `true` if the transaction note matches the expected message and the
 *          Ed25519 signature is valid for `creatorWallet`, `false` otherwise
 */
export async function verifySignedTransactionProof(
  appId: string,
  voteId: string,
  slug: string,
  creatorWallet: string,
  signedTxnBase64: string
): Promise<boolean> {
  try {
    const stxnBytes = Buffer.from(signedTxnBase64, "base64");
    const stxn = algosdk.decodeSignedTransaction(stxnBytes);

    if (!stxn.sig) return false;

    const expectedMessage = buildCreationMessage(appId, voteId, slug);
    const note = stxn.txn.note ? new TextDecoder().decode(stxn.txn.note) : "";
    
    if (note !== expectedMessage) return false;

    const bytesToSign = stxn.txn.bytesToSign();
    const { publicKey } = algosdk.decodeAddress(creatorWallet);
    const cryptoKey = await crypto.subtle.importKey("raw", publicKey, "Ed25519", false, ["verify"]);
    
    return await crypto.subtle.verify("Ed25519", cryptoKey, stxn.sig, bytesToSign);
  } catch {
    return false;
  }
}

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

