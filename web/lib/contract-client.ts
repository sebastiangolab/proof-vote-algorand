/**
 * ATC (AtomicTransactionComposer) builder functions for all ProofVote contract methods.
 * Each function returns a ready-to-execute ATC — call `.execute(algod, 4)` to submit.
 *
 * Important: functions that include a PayTxn argument add the payment transaction
 * BEFORE the AppCall in the group — required by the ABI framework.
 */

import algosdk from "algosdk";
import { getAlgodClient, generateVoteBoxName, generateUserVoteBoxName, type SweepTarget } from "./algorand";
import { VOTE_BOX_MBR, USER_VOTE_BOX_MBR } from "./algorand/constants";

// Load ABI from compiled artifacts (relative to project root at runtime)
const arc4 = require("../../contracts/artifacts/ProofVote.arc4.json");
const contract = new algosdk.ABIContract(arc4);

function getAppId(): number {
  const id = process.env.NEXT_PUBLIC_APP_ID;
  if (!id) throw new Error("NEXT_PUBLIC_APP_ID env var not set");
  
  return Number(id);
}

// ─── buildCreateVoteAtc ───────────────────────────────────────────────────────

/**
 * Creates a new voting poll on-chain.
 * Returns the assigned voteId (uint64) on execution.
 * Group: [PayTxn(voteBoxMBR)] + [AppCall(createVote)]
 *
 * @param params.sender - Creator's Algorand address
 * @param params.startAt - Vote start Unix timestamp (seconds)
 * @param params.endAt - Vote end Unix timestamp (seconds)
 * @param params.optionCount - Number of options (1-8)
 * @param params.stake - Required stake per vote in µALGO
 * @param params.withdrawWindow - Withdraw window in seconds after vote ends
 * @param params.signer - Transaction signer from useWallet()
 * @returns Configured ATC — returns voteId (uint64) on execution
 */
export async function buildCreateVoteAtc(params: {
  sender: string;
  startAt: bigint;
  endAt: bigint;
  optionCount: bigint;
  stake: bigint;
  withdrawWindow: bigint;
  signer: algosdk.TransactionSigner;
}): Promise<algosdk.AtomicTransactionComposer> {
  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();

  // PayTxn must come BEFORE AppCall — ABI framework reads preceding txn
  // Amount = VOTE_BOX_MBR (see algorand/constants.ts)
  const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: params.sender,
    receiver: algosdk.getApplicationAddress(appId),
    amount: VOTE_BOX_MBR,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
  });

  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("createVote"),
    // methodArgs: [startAt, endAt, optionCount, stake, withdrawWindow, mbrPayment]
    methodArgs: [
      params.startAt,
      params.endAt,
      params.optionCount,
      params.stake,
      params.withdrawWindow,
      { txn: mbrPayment, signer: params.signer }, // pay type arg
    ],
    sender: params.sender,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
    signer: params.signer,
    // No boxes needed for createVote
    // the contract creates the vote box on-chain using inner transactions
    boxes: [],
  });

  return atc;
}

// ─── buildVoteAtc ─────────────────────────────────────────────────────────────

/**
 * Casts a vote on a poll.
 * Both are refunded in full when the voter calls withdraw().
 * Group: [PayTxn(stake + userBoxMBR)] + [AppCall(vote)]
 *
 * @param params.sender - Voter's Algorand address
 * @param params.voteId - Poll ID (bigint)
 * @param params.choice - 0-indexed option index
 * @param params.stake - Exact stake amount from VoteState (µALGO)
 * @param params.signer - Transaction signer from useWallet()
 * @returns Configured ATC
 */
export async function buildVoteAtc(params: {
  sender: string;
  voteId: bigint;
  choice: bigint;
  stake: bigint;
  signer: algosdk.TransactionSigner;
}): Promise<algosdk.AtomicTransactionComposer> {
  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();

  // Total payment = stake + USER_VOTE_BOX_MBR (reclaimed on withdraw, see algorand/constants.ts)
  const paymentAmount = params.stake + USER_VOTE_BOX_MBR;

  const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: params.sender,
    receiver: algosdk.getApplicationAddress(appId),
    amount: paymentAmount,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
  });

  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("vote"),
    // methodArgs: [voteId, choice, payment]
    methodArgs: [
      params.voteId,
      params.choice,
      { txn: payTxn, signer: params.signer }, // pay type arg
    ],
    sender: params.sender,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
    signer: params.signer,
    boxes: [
      // Vote box (read) — prefix 'v' + voteId
      { appIndex: appId, name: generateVoteBoxName(params.voteId) },
      // User vote box (create) — prefix 'u' + voteId + address
      { appIndex: appId, name: generateUserVoteBoxName(params.voteId, params.sender) },
    ],
  });

  return atc;
}

// ─── buildWithdrawAtc ─────────────────────────────────────────────────────────

/**
 * Withdraws stake from a single poll. Only callable after voting ends and before
 * withdrawDeadline. Deletes the user box and refunds stake to the caller.
 *
 * @param params.sender - Voter's Algorand address (must match original voter)
 * @param params.voteId - Poll ID (bigint)
 * @param params.signer - Transaction signer from useWallet()
 * @returns Configured ATC
 */
export async function buildWithdrawAtc(params: {
  sender: string;
  voteId: bigint;
  signer: algosdk.TransactionSigner;
}): Promise<algosdk.AtomicTransactionComposer> {
  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();

  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("withdraw"),
    methodArgs: [params.voteId],
    sender: params.sender,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
    signer: params.signer,
    boxes: [
      // Vote box (read)
      { appIndex: appId, name: generateVoteBoxName(params.voteId) },
      // User box (delete after withdraw)
      { appIndex: appId, name: generateUserVoteBoxName(params.voteId, params.sender) },
    ],
  });

  return atc;
}

// ─── buildBatchWithdrawAtc ────────────────────────────────────────────────────

/**
 * Same as buildWithdrawAtc but for multiple polls in one atomic group (max 16).
 * Useful when a voter has open stakes in several polls and wants to reclaim all at once.
 *
 * @param params.voteIds - Array of vote IDs to withdraw from (max 16)
 * @param params.sender  - Voter's Algorand address
 * @param params.signer  - Transaction signer from useWallet()
 */
export async function buildBatchWithdrawAtc(params: {
  voteIds: bigint[];
  sender: string;
  signer: algosdk.TransactionSigner;
}): Promise<algosdk.AtomicTransactionComposer> {
  if (params.voteIds.length === 0) throw new Error("No voteIds provided");
  if (params.voteIds.length > 16) throw new Error("Max 16 withdrawals per batch");

  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();

  for (const voteId of params.voteIds) {
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [voteId],
      sender: params.sender,
      suggestedParams: { ...sp, fee: 1000n, flatFee: true },
      signer: params.signer,
      boxes: [
        { appIndex: appId, name: generateVoteBoxName(voteId) },
        { appIndex: appId, name: generateUserVoteBoxName(voteId, params.sender) },
      ],
    });
  }

  return atc;
}

// ─── buildSweepUserAtc ────────────────────────────────────────────────────────

/**
 * Platform owner only. Claims unclaimed stake of a specific user after withdrawDeadline.
 * Deletes the user box and forwards stake to the platform owner.
 *
 * @param params.sender - Platform owner's Algorand address
 * @param params.voteId - Poll ID (bigint)
 * @param params.userAddress - Voter address whose stake will be swept
 * @param params.signer - Transaction signer from useWallet()
 * @returns Configured ATC
 */
export async function buildSweepUserAtc(params: {
  sender: string;
  voteId: bigint;
  userAddress: string;
  signer: algosdk.TransactionSigner;
}): Promise<algosdk.AtomicTransactionComposer> {
  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();

  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("sweepUser"),
    methodArgs: [params.voteId, params.userAddress],
    sender: params.sender,
    suggestedParams: { ...sp, fee: 1000n, flatFee: true },
    signer: params.signer,
    boxes: [
      // Vote box (read sweepTo address)
      { appIndex: appId, name: generateVoteBoxName(params.voteId) },
      // User box (delete after sweep)
      { appIndex: appId, name: generateUserVoteBoxName(params.voteId, params.userAddress) },
    ],
  });

  return atc;
}

// ─── buildBatchSweepAtc ───────────────────────────────────────────────────────

/**
 * Same as buildSweepUserAtc but for multiple users in one atomic group (max 16).
 * Caller must chunk the targets array into slices of 16 before calling — the ATC
 * group limit is 16 transactions.
 *
 * @param params.targets - Array of SweepTarget (max 16) to sweep in one group
 * @param params.sender - Platform owner's Algorand address
 * @param params.signer - Transaction signer from useWallet()
 * @returns Configured ATC — call `.execute(algod, 4)` to submit
 */
export async function buildBatchSweepAtc(params: {
  targets: SweepTarget[];
  sender: string;
  signer: algosdk.TransactionSigner;
}): Promise<algosdk.AtomicTransactionComposer> {
  if (params.targets.length === 0) throw new Error("No sweep targets provided");
  if (params.targets.length > 16) throw new Error("Max 16 sweep targets per batch");

  const algod = getAlgodClient();
  const appId = getAppId();
  const sp = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();

  for (const target of params.targets) {
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [target.voteId, target.userAddress],
      sender: params.sender,
      suggestedParams: { ...sp, fee: 1000n, flatFee: true },
      signer: params.signer,
      boxes: [
        { appIndex: appId, name: generateVoteBoxName(target.voteId) },
        { appIndex: appId, name: generateUserVoteBoxName(target.voteId, target.userAddress) },
      ],
    });
  }

  return atc;
}
