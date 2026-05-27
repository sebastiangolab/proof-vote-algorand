/**
 * @jest-environment node
 */
import algosdk from "algosdk";
import { buildCreationMessage, verifySignedTransactionProof } from "./signatures";

// ─── buildCreationMessage ─────────────────────────────────────────────────────

describe("buildCreationMessage", () => {
  it("produces the expected canonical format", () => {
    const msg = buildCreationMessage("123456789", "my-vote");
    expect(msg).toBe("ProofVote: create metadata for appId=123456789 slug=my-vote");
  });

  it("includes both parameters in the message", () => {
    const msg = buildCreationMessage("999", "alpha-poll");
    expect(msg).toContain("appId=999");
    expect(msg).toContain("slug=alpha-poll");
  });
});

// ─── verifySignedTransactionProof ─────────────────────────────────────────────

describe("verifySignedTransactionProof", () => {
  const account = algosdk.generateAccount();
  const address = account.addr.toString();
  const appId = "123456789";
  const slug = "test-slug";
  const message = buildCreationMessage(appId, slug);

  const suggestedParams = {
    fee: 0n,
    firstValid: 1n,
    lastValid: 1001n,
    genesisHash: Buffer.alloc(32, 1),
    genesisID: "testnet-v1.0",
    minFee: 1000n,
  };

  function makeSignedTxn(note: string, senderAccount = account) {
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: senderAccount.addr.toString(),
      receiver: senderAccount.addr.toString(),
      amount: 0n,
      note: Buffer.from(note),
      suggestedParams,
    });
    const signed = algosdk.signTransaction(txn, senderAccount.sk);
    return Buffer.from(signed.blob).toString("base64");
  }

  it("returns true for a valid signed transaction proof", async () => {
    const signedTxnBase64 = makeSignedTxn(message);
    expect(await verifySignedTransactionProof(appId, slug, address, signedTxnBase64)).toBe(true);
  });

  it("returns false when note doesn't match expected message", async () => {
    const signedTxnBase64 = makeSignedTxn("wrong message");
    expect(await verifySignedTransactionProof(appId, slug, address, signedTxnBase64)).toBe(false);
  });

  it("returns false when appId is different from what was signed", async () => {
    const signedTxnBase64 = makeSignedTxn(message);
    expect(await verifySignedTransactionProof("999", slug, address, signedTxnBase64)).toBe(false);
  });

  it("returns false when creatorWallet doesn't match the signer", async () => {
    const otherAccount = algosdk.generateAccount();
    const signedTxnBase64 = makeSignedTxn(message);
    expect(await verifySignedTransactionProof(appId, slug, otherAccount.addr.toString(), signedTxnBase64)).toBe(false);
  });

  it("returns false for invalid base64 input", async () => {
    expect(await verifySignedTransactionProof(appId, slug, address, "not!!valid!!base64")).toBe(false);
  });

  it("returns false for an invalid Algorand address", async () => {
    const signedTxnBase64 = makeSignedTxn(message);
    expect(await verifySignedTransactionProof(appId, slug, "NOTANADDRESS", signedTxnBase64)).toBe(false);
  });
});
