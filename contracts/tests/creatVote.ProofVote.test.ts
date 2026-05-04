import algosdk from "algosdk";
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing";
import { AlgoAmount } from "@algorandfoundation/algokit-utils/types/amount";
import { deployContract, loadContract } from "./helpers/deploy";
import { generateVoteBoxName, fetchVoteState } from "./helpers/boxes";
import { latestTimestamp } from "./helpers/time";
import { VOTE_BOX_MBR } from "../src/constants";
import { DEFAULT_END_AT_OFFSET, STAKE } from "./testConstants";
import { TestAccount } from "./types";

// Provides an isolated Algorand sandbox environment (algod client, funded accounts) and resets
// blockchain state before each test via fixture.newScope, preventing test cross-contamination.
const fixture = algorandFixture();
beforeEach(fixture.newScope);

describe("createVote", () => {
  let appId: number;
  let appAddress: string;
  let creator: TestAccount;
  let contract: algosdk.ABIContract;

  // Generates a funded test account and deploys the ProofVote contract before each test
  beforeEach(async () => {
    const { algod, generateAccount } = fixture.context;

    creator = await generateAccount({ initialFunds: AlgoAmount.Algos(1000), suppressLog: true });

    ({ appId, appAddress } = await deployContract(algod, creator));
    contract = loadContract();
  });

  // Tests that a vote can be successfully created with valid parameters,
  // and that the corresponding VoteState is stored correctly in the expected box.
  it("creates a poll and returns a voteId, stores VoteState in box", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const optionCount = 3;
    const suggestedParams = await algod.getTransactionParams().do();

    // Create the MBR payment transaction to fund the vote box, which is required for createVote to succeed.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method with the specified arguments and the MBR payment transaction.
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [
        now + DEFAULT_END_AT_OFFSET,
        optionCount,
        STAKE,
        { txn: mbrPayment, signer: creator.signer },
      ],
      sender: creator.addr,
      signer: creator.signer,
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
    expect(voteState!.stake).toBe(BigInt(STAKE));
    expect(voteState!.counts.every((count) => count === 0n)).toBe(true);
  });

  // Tests that createVote rejects when endAt is not in the future.
  it("rejects when endAt is not in the future", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    // Create the MBR payment transaction to fund the vote box, which is required for createVote to succeed.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method with endAt in the distant past
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [1n, 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    // Expect the transaction to be rejected because endAt is not in the future.
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that createVote rejects when the provided stake is less than the minimum required
  it("rejects when STAKE < minStake", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    // Create the MBR payment transaction to fund the vote box, which is required for createVote to succeed.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method with STAKE < minStake
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + DEFAULT_END_AT_OFFSET, 2, 100, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    // Expect the transaction to be rejected due to invalid STAKE parameter.
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that createVote rejects when optionCount is less than the minimum required (2),
  // ensuring that a poll must always have at least two options to be meaningful.
  it("rejects when optionCount < 2", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    // Create the MBR payment transaction to fund the vote box, which is required for createVote to succeed.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method with optionCount < 2
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + DEFAULT_END_AT_OFFSET, 1, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    // Expect the transaction to be rejected due to invalid optionCount parameter.
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that createVote rejects when optionCount is greater than the maximum allowed (8),
  // ensuring that the contract enforces reasonable limits on the number of voting options.
  it("rejects when optionCount > 8", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    // Create the MBR payment transaction to fund the vote box, which is required for createVote to succeed.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method with optionCount > 8
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + DEFAULT_END_AT_OFFSET, 9, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    // Expect the transaction to be rejected due to invalid optionCount parameter.
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that createVote rejects when the provided stake exceeds the maximum allowed,
  // ensuring that the contract enforces an upper bound on stake to prevent unreasonably high barriers.
  it("rejects when stake > maxStake", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    // Create the MBR payment transaction to fund the vote box, which is required for createVote to succeed.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method with stake > maxStake
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + DEFAULT_END_AT_OFFSET, 2, 11_000_000, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    // Expect the transaction to be rejected due to invalid stake parameter.
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

});