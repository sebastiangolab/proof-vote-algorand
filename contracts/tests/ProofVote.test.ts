/**
 * ProofVote contract unit tests — runs against AlgoKit LocalNet.
 *
 * Prerequisites:
 *   algokit localnet start     # Docker must be running
 *   npm run build              # generates artifacts/
 *   npm run test               # runs this file
 *
 * Each test suite deploys a fresh contract instance.
 */

import algosdk from "algosdk";
import {
  getLocalnetClient,
  getDispenser,
  createTestAccounts,
  deployContract,
  loadContract,
  generateVoteBoxName,
  generateUserVoteBoxName,
  fetchVoteState,
  fetchUserVoteState,
} from "./helpers/testSetup";
import { VOTE_BOX_MBR, USER_VOTE_BOX_MBR } from "../src/constants";

// ─── Shared state ─────────────────────────────────────────────────────────────

let algod: algosdk.Algodv2;
let dispenser: algosdk.Account;

// Helper: get current on-chain timestamp (last confirmed block)
async function latestTimestamp(): Promise<number> {
  const status = await algod.status().do();
  const lastRound = status["last-round"] as number;
  const block = await algod.block(lastRound).do();
  return block.block.ts as number;
}

// Helper: sleep for ms milliseconds (advances wall-clock, not AVM time)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  algod = getLocalnetClient();
  dispenser = await getDispenser(algod);
});

// ─── createVote ───────────────────────────────────────────────────────────────

describe("createVote", () => {
  let appId: number;
  let appAddress: string;
  let creator: algosdk.Account;
  let contract: algosdk.ABIContract;

  beforeEach(async () => {
    [creator] = await createTestAccounts(algod, dispenser, 1, 50_000_000); // 50 ALGO
    ({ appId, appAddress } = await deployContract(algod, creator));
    contract = loadContract();
  });

  it("creates a poll and returns a voteId, stores VoteState in box", async () => {
    const now = await latestTimestamp();
    const startAt = now + 10;
    const endAt = now + 3600;
    const optionCount = 3;
    const stake = 1_000_000;
    const withdrawWindow = 86_400;

    const suggestedParams = await algod.getTransactionParams().do();

    // MBR payment for vote box: 73,300 µALGO
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const signer = algosdk.makeBasicAccountTransactionSigner(creator);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [
        startAt,
        endAt,
        optionCount,
        stake,
        withdrawWindow,
        { txn: mbrPayment, signer }, // mbrPayment PayTxn
      ],
      sender: creator.addr,
      signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    const result = await atc.execute(algod, 4);
    const voteId = Number(result.methodResults[0].returnValue);
    expect(voteId).toBe(1);

    // Verify VoteState box was created
    const voteState = await fetchVoteState(algod, appId, voteId);
    expect(voteState).not.toBeNull();
    expect(voteState!.optionCount).toBe(BigInt(optionCount));
    expect(voteState!.stake).toBe(BigInt(stake));
    expect(voteState!.counts.every((c) => c === 0n)).toBe(true);
  });

  it("rejects when endAt <= startAt", async () => {
    const now = await latestTimestamp();
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [
        now + 100,
        now + 100,
        2,
        1_000_000,
        86_400,
        { txn: mbrPayment, signer },
      ],
      sender: creator.addr,
      signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  it("rejects when stake < minStake", async () => {
    const now = await latestTimestamp();
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      // stake = 100 < minStake (500_000)
      methodArgs: [now + 10, now + 3600, 2, 100, 86_400, { txn: mbrPayment, signer }],
      sender: creator.addr,
      signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  it("rejects when optionCount > 8", async () => {
    const now = await latestTimestamp();
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [
        now + 10,
        now + 3600,
        9,
        1_000_000,
        86_400,
        { txn: mbrPayment, signer },
      ],
      sender: creator.addr,
      signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });
});

// ─── vote ─────────────────────────────────────────────────────────────────────

describe("vote", () => {
  let appId: number;
  let appAddress: string;
  let creator: algosdk.Account;
  let voter: algosdk.Account;
  let contract: algosdk.ABIContract;
  let voteId: number;
  const STAKE = 1_000_000;

  // Create a fresh app and an active poll before each test
  beforeEach(async () => {
    [creator, voter] = await createTestAccounts(algod, dispenser, 2, 50_000_000);
    ({ appId, appAddress } = await deployContract(algod, creator));
    contract = loadContract();

    const now = await latestTimestamp();
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      // startAt = now - 5 so voting is already open, endAt = now + 3600
      methodArgs: [
        now - 5,
        now + 3600,
        3,
        STAKE,
        86_400,
        { txn: mbrPayment, signer },
      ],
      sender: creator.addr,
      signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    const result = await atc.execute(algod, 4);
    voteId = Number(result.methodResults[0].returnValue);
  });

  it("records vote and increments option count", async () => {
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(voter);
    const choice = 1;

    // PayTxn: stake + user box MBR (USER_VOTE_BOX_MBR)
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: voter.addr,
      to: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, choice, { txn: payTxn, signer }],
      sender: voter.addr,
      signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });

    await atc.execute(algod, 4);

    // Verify UserVoteState
    const userState = await fetchUserVoteState(algod, appId, voteId, voter.addr);
    expect(userState).not.toBeNull();
    expect(userState!.voted).toBe(true);
    expect(userState!.choice).toBe(BigInt(choice));
    expect(userState!.stakeLocked).toBe(BigInt(STAKE));

    // Verify vote count incremented
    const voteState = await fetchVoteState(algod, appId, voteId);
    expect(voteState!.counts[choice]).toBe(1n);
  });

  it("rejects a double vote from the same wallet", async () => {
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(voter);

    const makeVoteAtc = async () => {
      const sp = await algod.getTransactionParams().do();
      const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: voter.addr,
        to: appAddress,
        amount: STAKE + USER_VOTE_BOX_MBR,
        suggestedParams: sp,
      });
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: appId,
        method: contract.getMethodByName("vote"),
        methodArgs: [voteId, 0, { txn: payTxn, signer }],
        sender: voter.addr,
        signer,
        suggestedParams: sp,
        boxes: [
          { appIndex: 0, name: generateVoteBoxName(voteId) },
          { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
        ],
      });
      return atc;
    };

    // First vote — succeeds
    await (await makeVoteAtc()).execute(algod, 4);

    // Second vote — must fail
    await expect((await makeVoteAtc()).execute(algod, 4)).rejects.toThrow();
  });

  it("rejects when payment amount is wrong", async () => {
    const suggestedParams = await algod.getTransactionParams().do();
    const signer = algosdk.makeBasicAccountTransactionSigner(voter);

    // Pay 1 µALGO less than required
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: voter.addr,
      to: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR - 1,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: payTxn, signer }],
      sender: voter.addr,
      signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  it("rejects when voting is over (after endAt)", async () => {
    // Create a poll that has already ended
    [creator] = await createTestAccounts(algod, dispenser, 1, 50_000_000);
    ({ appId, appAddress } = await deployContract(algod, creator));
    contract = loadContract();

    // We can't easily time-travel in LocalNet, so we use a poll with
    // endAt = latestTimestamp - 1 (already ended before the block it's confirmed in)
    // In practice, test this by creating a poll with endAt in the past.
    // Note: LocalNet block timestamps advance per block. We set endAt = 1 (epoch past).
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);
    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [1, 2, 2, 1_000_000, 86_400, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const r = await atc.execute(algod, 4);
    const expiredVoteId = Number(r.methodResults[0].returnValue);

    const vs = algosdk.makeBasicAccountTransactionSigner(voter);
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: voter.addr,
      to: appAddress,
      amount: 1_000_000 + USER_VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [expiredVoteId, 0, { txn: payTxn, signer: vs }],
      sender: voter.addr,
      signer: vs,
      suggestedParams: sp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(expiredVoteId) },
        { appIndex: 0, name: generateUserVoteBoxName(expiredVoteId, voter.addr) },
      ],
    });

    await expect(voteAtc.execute(algod, 4)).rejects.toThrow();
  });
});

// ─── withdraw ─────────────────────────────────────────────────────────────────

describe("withdraw", () => {
  let appId: number;
  let appAddress: string;
  let creator: algosdk.Account;
  let voter: algosdk.Account;
  let contract: algosdk.ABIContract;
  let voteId: number;
  const STAKE = 1_000_000;

  // Helper: vote as `voter` on `voteId`
  async function castVote(v: algosdk.Account, vid: number, choice = 0): Promise<void> {
    const sp = await algod.getTransactionParams().do();
    const s = algosdk.makeBasicAccountTransactionSigner(v);
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: v.addr,
      to: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [vid, choice, { txn: payTxn, signer: s }],
      sender: v.addr,
      signer: s,
      suggestedParams: sp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(vid) },
        { appIndex: 0, name: generateUserVoteBoxName(vid, v.addr) },
      ],
    });
    await atc.execute(algod, 4);
  }

  // Create a poll with endAt very soon so we can test withdraw timing.
  // LocalNet blocks are ~1s apart so we use a very short poll.
  beforeEach(async () => {
    [creator, voter] = await createTestAccounts(algod, dispenser, 2, 50_000_000);
    ({ appId, appAddress } = await deployContract(algod, creator, { minStake: 100_000 }));
    contract = loadContract();
  });

  it("refunds stake + MBR after vote ends, within deadline", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    // Create a poll: startAt = now - 10, endAt = now + 2 (ends very soon), withdraw window = 3600
    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now - 10, now + 2, 2, STAKE, 3600, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const r = await createAtc.execute(algod, 4);
    voteId = Number(r.methodResults[0].returnValue);

    // Vote while poll is open
    await castVote(voter, voteId);

    // Wait for the poll to end (endAt + 1 block)
    await sleep(3000);

    // Get voter balance before withdraw
    const balBefore = (await algod.accountInformation(voter.addr).do())["amount"] as number;

    // Withdraw
    const wsp = await algod.getTransactionParams().do();
    const ws = algosdk.makeBasicAccountTransactionSigner(voter);
    const withdrawAtc = new algosdk.AtomicTransactionComposer();
    withdrawAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [voteId],
      sender: voter.addr,
      signer: ws,
      suggestedParams: wsp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await withdrawAtc.execute(algod, 4);

    const balAfter = (await algod.accountInformation(voter.addr).do())["amount"] as number;
    // Should receive back stake + MBR (minus txn fee)
    expect(balAfter).toBeGreaterThan(balBefore);

    // Box should be gone
    const userState = await fetchUserVoteState(algod, appId, voteId, voter.addr);
    expect(userState).toBeNull();
  });

  it("rejects withdrawal when window is closed (after withdrawDeadline)", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    // Create a poll with withdrawWindow = 0 → deadline = endAt, already passed
    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      // endAt = 2, withdrawWindow = 0 → withdrawDeadline = 2 (already in the past)
      methodArgs: [1, 2, 2, STAKE, 0, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);

    // Don't need to vote — just check the deadline check
    const wsp = await algod.getTransactionParams().do();
    const ws = algosdk.makeBasicAccountTransactionSigner(voter);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [1],
      sender: voter.addr,
      signer: ws,
      suggestedParams: wsp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  it("rejects withdrawal when user did not vote (no UserVoteState box)", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now - 10, now + 2, 2, STAKE, 3600, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);
    await sleep(3000);

    // voter never voted → no UserVoteState box → should fail
    const wsp = await algod.getTransactionParams().do();
    const ws = algosdk.makeBasicAccountTransactionSigner(voter);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [1],
      sender: voter.addr,
      signer: ws,
      suggestedParams: wsp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  it("rejects a second withdrawal (box deleted after first)", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now - 10, now + 2, 2, STAKE, 3600, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const r = await createAtc.execute(algod, 4);
    voteId = Number(r.methodResults[0].returnValue);

    await castVote(voter, voteId);
    await sleep(3000);

    const makeWithdrawAtc = async () => {
      const wsp = await algod.getTransactionParams().do();
      const ws = algosdk.makeBasicAccountTransactionSigner(voter);
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: appId,
        method: contract.getMethodByName("withdraw"),
        methodArgs: [voteId],
        sender: voter.addr,
        signer: ws,
        suggestedParams: wsp,
        boxes: [
          { appIndex: 0, name: generateVoteBoxName(voteId) },
          { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
        ],
      });
      return atc;
    };

    // First withdrawal — succeeds
    await (await makeWithdrawAtc()).execute(algod, 4);
    // Second withdrawal — box is gone → fails
    await expect((await makeWithdrawAtc()).execute(algod, 4)).rejects.toThrow();
  });
});

// ─── sweepUser ────────────────────────────────────────────────────────────────

describe("sweepUser", () => {
  let appId: number;
  let appAddress: string;
  let creator: algosdk.Account;
  let voter: algosdk.Account;
  let contract: algosdk.ABIContract;
  const STAKE = 1_000_000;

  beforeEach(async () => {
    [creator, voter] = await createTestAccounts(algod, dispenser, 2, 50_000_000);
    ({ appId, appAddress } = await deployContract(algod, creator, { minStake: 100_000 }));
    contract = loadContract();
  });

  it("lets platformOwner sweep after withdrawal deadline", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    // Poll: endAt = now + 2, withdrawWindow = 0 → deadline = now + 2
    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now - 10, now + 2, 2, STAKE, 0, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const r = await createAtc.execute(algod, 4);
    const voteId = Number(r.methodResults[0].returnValue);

    // Cast vote
    const vsp = await algod.getTransactionParams().do();
    const vs = algosdk.makeBasicAccountTransactionSigner(voter);
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: voter.addr,
      to: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: vsp,
    });
    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: payTxn, signer: vs }],
      sender: voter.addr,
      signer: vs,
      suggestedParams: vsp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await voteAtc.execute(algod, 4);

    // Wait for deadline to pass (endAt + withdrawWindow)
    await sleep(4000);

    const balBefore = (await algod.accountInformation(creator.addr).do())["amount"] as number;

    const ssp = await algod.getTransactionParams().do();
    const sweepAtc = new algosdk.AtomicTransactionComposer();
    sweepAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [voteId, voter.addr],
      sender: creator.addr,
      signer: cs,
      suggestedParams: ssp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await sweepAtc.execute(algod, 4);

    const balAfter = (await algod.accountInformation(creator.addr).do())["amount"] as number;
    // creator is both sweepTo and platformOwner here → received stake + MBR
    expect(balAfter).toBeGreaterThan(balBefore);

    // User box should be gone
    const userState = await fetchUserVoteState(algod, appId, voteId, voter.addr);
    expect(userState).toBeNull();
  });

  it("rejects sweep by non-owner", async () => {
    const [nonOwner] = await createTestAccounts(algod, dispenser, 1, 10_000_000);
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now - 10, now + 2, 2, STAKE, 0, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);
    await sleep(4000);

    const ns = algosdk.makeBasicAccountTransactionSigner(nonOwner);
    const nsp = await algod.getTransactionParams().do();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [1, voter.addr],
      sender: nonOwner.addr,
      signer: ns,
      suggestedParams: nsp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  it("rejects sweep before withdrawal deadline", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      // Large withdraw window → deadline is far in the future
      methodArgs: [
        now - 10,
        now + 2,
        2,
        STAKE,
        99_999_999,
        { txn: mbrPay, signer: cs },
      ],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);

    // Try to sweep immediately — window still open
    const ssp = await algod.getTransactionParams().do();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [1, voter.addr],
      sender: creator.addr,
      signer: cs,
      suggestedParams: ssp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });
});

// ─── updatePlatformOwner ──────────────────────────────────────────────────────

describe("updatePlatformOwner", () => {
  let appId: number;
  let creator: algosdk.Account;
  let contract: algosdk.ABIContract;

  beforeEach(async () => {
    [creator] = await createTestAccounts(algod, dispenser, 1, 10_000_000);
    ({ appId } = await deployContract(algod, creator));
    contract = loadContract();
  });

  it("lets platformOwner transfer ownership to a new address", async () => {
    const [newOwner] = await createTestAccounts(algod, dispenser, 1, 10_000_000);
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [newOwner.addr],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
    });
    await atc.execute(algod, 4);

    // Verify the new owner is stored in global state
    const appInfo = await algod.getApplicationByID(appId).do();
    const ownerEntry = (appInfo.params["global-state"] as Array<{ key: string; value: { bytes: string } }>)
      .find((kv) => Buffer.from(kv.key, "base64").toString() === "platformOwner");
    expect(ownerEntry).toBeDefined();
    const storedAddr = algosdk.encodeAddress(Buffer.from(ownerEntry!.value.bytes, "base64"));
    expect(storedAddr).toBe(newOwner.addr);
  });

  it("rejects ownership transfer by non-owner", async () => {
    const [nonOwner, target] = await createTestAccounts(algod, dispenser, 2, 10_000_000);
    const sp = await algod.getTransactionParams().do();
    const ns = algosdk.makeBasicAccountTransactionSigner(nonOwner);

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [target.addr],
      sender: nonOwner.addr,
      signer: ns,
      suggestedParams: sp,
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });
});

// ─── sweepUser (extra cases) ──────────────────────────────────────────────────

describe("sweepUser — double sweep", () => {
  let appId: number;
  let appAddress: string;
  let creator: algosdk.Account;
  let voter: algosdk.Account;
  let contract: algosdk.ABIContract;
  const STAKE = 1_000_000;

  beforeEach(async () => {
    [creator, voter] = await createTestAccounts(algod, dispenser, 2, 50_000_000);
    ({ appId, appAddress } = await deployContract(algod, creator, { minStake: 100_000 }));
    contract = loadContract();
  });

  it("rejects a second sweep after the first already deleted the box", async () => {
    const now = await latestTimestamp();
    const sp = await algod.getTransactionParams().do();
    const cs = algosdk.makeBasicAccountTransactionSigner(creator);

    // Poll with no withdraw window so deadline = endAt (in the past)
    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: creator.addr,
      to: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams: sp,
    });
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now - 10, now + 2, 2, STAKE, 0, { txn: mbrPay, signer: cs }],
      sender: creator.addr,
      signer: cs,
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const r = await createAtc.execute(algod, 4);
    const voteId = Number(r.methodResults[0].returnValue);

    // Cast vote
    const vsp = await algod.getTransactionParams().do();
    const vs = algosdk.makeBasicAccountTransactionSigner(voter);
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: voter.addr,
      to: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: vsp,
    });
    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: payTxn, signer: vs }],
      sender: voter.addr,
      signer: vs,
      suggestedParams: vsp,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await voteAtc.execute(algod, 4);

    // Wait for deadline to pass
    await sleep(4000);

    const makeSweepAtc = async () => {
      const ssp = await algod.getTransactionParams().do();
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: appId,
        method: contract.getMethodByName("sweepUser"),
        methodArgs: [voteId, voter.addr],
        sender: creator.addr,
        signer: cs,
        suggestedParams: ssp,
        boxes: [
          { appIndex: 0, name: generateVoteBoxName(voteId) },
          { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
        ],
      });
      return atc;
    };

    // First sweep — succeeds
    await (await makeSweepAtc()).execute(algod, 4);
    // Second sweep — box is gone → fails
    await expect((await makeSweepAtc()).execute(algod, 4)).rejects.toThrow();
  });
});
