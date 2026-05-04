import algosdk from "algosdk";
import { AlgorandFixture } from "@algorandfoundation/algokit-utils/types/testing";
import { TestAccount } from "../types";
import { generateVoteBoxName } from "./boxes";

// Helper: get current on-chain timestamp (last confirmed block)
export async function latestTimestamp(fixture: AlgorandFixture): Promise<bigint> {
  const { algod } = fixture.context;

  // Get the latest block to read its timestamp. This is more reliable than using local system time,
  // since the contract logic depends on block timestamps, not local time.
  const status = await algod.status().do();
  const lastRound = status.lastRound;
  const block = await algod.block(lastRound).do();

  // The block header contains a timestamp field which is the Unix timestamp of when the block was produced.
  return block.block.header.timestamp;
}

/** Mines 1 block on the network. */
async function mineBlock(algod: algosdk.Algodv2, account: TestAccount): Promise<void> {
  const params = await algod.getTransactionParams().do();

  // Create a simple payment transaction from the account to itself with 0 amount, just to trigger block production.
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    receiver: account.addr,
    amount: 0,
    suggestedParams: params,
  });

  // Sign and send the transaction to mine a block, then wait for confirmation
  const signedTxn = txn.signTxn(account.sk);
  await algod.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(algod, txn.txID().toString(), 4);
}

// Helper: forward time to after the poll end or withdraw deadline using the algod devmode
// timestamp offset API. Sets a fixed offset so the next mined block's timestamp exceeds
// the target, then mines one block to materialise the new timestamp.
// This replaces the previous block-mining loop and runs in O(1) blocks regardless of
// how far into the future the target is.
export async function forwardToAfterVotePhase(
  algod: algosdk.Algodv2,
  appId: number,
  voteId: number,
  sender: TestAccount,
  fixture: AlgorandFixture,
  phase: 'pollEnd' | 'withdrawDeadline'
): Promise<void> {
  // Fetch the vote box to get the endAt or withdrawDeadline timestamp, depending on the phase we want to forward past
  const box = await algod.getApplicationBoxByName(appId, generateVoteBoxName(voteId)).do();

  // Depending on the phase, the target timestamp is either the poll end time or the withdraw deadline,
  // which are located at different offsets in the box value.
  const target = phase === 'pollEnd'
    ? algosdk.decodeUint64(box.value.slice(32, 40), 'bigint')
    : algosdk.decodeUint64(box.value.slice(48, 56), 'bigint');

  const now = await latestTimestamp(fixture);

  // Already past the target — no action needed.
  if (now > target) return;

  // Compute the offset needed so that the next block's timestamp exceeds the target by 1 second.
  // setBlockOffsetTimestamp adds a fixed delta to every subsequent block's timestamp.
  const offsetSeconds = target - now + 1n;
  await algod.setBlockOffsetTimestamp(offsetSeconds).do();

  // Mine one block to produce a confirmed block that carries the new timestamp.
  await mineBlock(algod, sender);
}

// Registers an afterEach hook that resets the devmode block timestamp offset to zero.
// Call this once per test file that uses forwardToAfterVotePhase, so the offset does not
// leak across tests (fixture.newScope does not restart the node, so the offset persists).
//
// Usage:
//   registerTimestampResetAfterEach(() => fixture.context.algod);
export function registerTimestampResetAfterEach(getAlgod: () => algosdk.Algodv2): void {
  afterEach(async () => {
    await getAlgod().setBlockOffsetTimestamp(0).do();
  });
}
