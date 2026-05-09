import algosdk from "algosdk";
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing";
import { AlgoAmount } from "@algorandfoundation/algokit-utils/types/amount";
import { deployContract, loadContract } from "./helpers/deploy";
import { generateVoteBoxName, generateUserVoteBoxName, fetchVoteState, fetchUserVoteState } from "./helpers/boxes";
import { latestTimestamp, forwardToAfterVotePhase, registerTimestampResetAfterEach } from "./helpers/time";
import { VOTE_BOX_MBR, USER_VOTE_BOX_MBR } from "../src/constants";
import { DEFAULT_END_AT_OFFSET, STAKE } from "./testConstants";
import { TestAccount } from "./types";

// Provides an isolated Algorand sandbox environment (algod client, funded accounts) and resets
// blockchain state before each test via fixture.newScope, preventing test cross-contamination.
const fixture = algorandFixture();
beforeEach(fixture.newScope);
registerTimestampResetAfterEach(() => fixture.context.algod);

describe("vote", () => {
  let appId: number;
  let appAddress: string;
  let creator: TestAccount;
  let voter: TestAccount;
  let contract: algosdk.ABIContract;
  let voteId: number;

  // Generates a funded test accounts and deploys the ProofVote contract before each test,
  // then creates a vote with voting currently open (startAt in the past, endAt in the future)
  // so that we can test the vote method directly without needing to manipulate time in most tests.
  beforeEach(async () => {
    const { algod, generateAccount } = fixture.context;

    creator = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });
    voter = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });

    ({ appId, appAddress } = await deployContract(algod, creator));
    contract = loadContract();

    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + DEFAULT_END_AT_OFFSET, 3, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    const result = await atc.execute(algod, 4);

    voteId = Number(result.methodResults[0].returnValue);
  });

  // Tests that a user can successfully vote by calling the vote method with the correct payment, a
  // nd that their UserVoteState is updated and the vote counts are incremented accordingly.
  it("records vote and increments option count", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();
    const choice = 1;

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, choice, { txn: mbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
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

  // Tests that a user cannot vote twice from the same wallet, and that the contract correctly rejects the second vote attempt.
  it("rejects a double vote from the same wallet", async () => {
    const { algod } = fixture.context;

    const makeVoteAtc = async () => {
      const suggestedParams = await algod.getTransactionParams().do();

      const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: voter.addr,
        receiver: appAddress,
        amount: STAKE + USER_VOTE_BOX_MBR,
        suggestedParams,
      });

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: appId,
        method: contract.getMethodByName("vote"),
        methodArgs: [voteId, 0, { txn: mbrPayment, signer: voter.signer }],
        sender: voter.addr,
        signer: voter.signer,
        suggestedParams,
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

  // Tests that a user cannot vote with an incorrect payment amount, and that the contract correctly rejects the transaction.
  it("rejects when payment amount is wrong", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    // Create a payment transaction with an incorrect amount (less than the required STAKE + USER_VOTE_BOX_MBR) for the user vote box.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR - 1,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: mbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that a user cannot vote on a non-existent vote ID, and that the contract correctly rejects the transaction.
  it("rejects when vote does not exist", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();
    const nonExistentVoteId = 999;

    // Create a mbr payment transaction for the user vote box with the correct amount,
    // but we will attempt to use it to vote on a non-existent vote ID.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [nonExistentVoteId, 0, { txn: mbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(nonExistentVoteId) },
        { appIndex: 0, name: generateUserVoteBoxName(nonExistentVoteId, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that a user cannot vote with an out-of-range choice index (>= optionCount), and that the contract correctly rejects the transaction.
  it("rejects when choice index is out of range", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    // The poll was created with optionCount = 3 (valid choices: 0, 1, 2), so choice = 3 is out of range.
    const invalidChoice = 3;

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, invalidChoice, { txn: mbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that the creator of a poll cannot vote on their own poll.
  it("rejects when the creator tries to vote on their own poll", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, creator.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that two voters casting votes on different choices each increment only their chosen option's count.
  it("multiple voters for different choices accumulate counts independently", async () => {
    const { algod, generateAccount } = fixture.context;
    const voter2 = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });

    // Helper function to create and execute a vote transaction for a given voter and choice.
    const makeVoteAtc = async (v: TestAccount, choice: number) => {
      const suggestedParams = await algod.getTransactionParams().do();
      const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: v.addr,
        receiver: appAddress,
        amount: STAKE + USER_VOTE_BOX_MBR,
        suggestedParams,
      });

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: appId,
        method: contract.getMethodByName("vote"),
        methodArgs: [voteId, choice, { txn: mbrPayment, signer: v.signer }],
        sender: v.addr,
        signer: v.signer,
        suggestedParams,
        boxes: [
          { appIndex: 0, name: generateVoteBoxName(voteId) },
          { appIndex: 0, name: generateUserVoteBoxName(voteId, v.addr) },
        ],
      });

      return atc;
    };

    await (await makeVoteAtc(voter, 0)).execute(algod, 4);
    await (await makeVoteAtc(voter2, 1)).execute(algod, 4);

    const voteState = await fetchVoteState(algod, appId, voteId);
    expect(voteState!.counts[0]).toBe(1n);
    expect(voteState!.counts[1]).toBe(1n);
    expect(voteState!.counts.slice(2).every((c) => c === 0n)).toBe(true);
  });

  // Tests that a user cannot vote after the poll has ended (after endAt), and that the contract correctly rejects the transaction.
  it("rejects when voting is over (after endAt)", async () => {
    const { algod, generateAccount } = fixture.context;

    // Create a fresh app with a poll that ends in 60 seconds, then advance time past it.
    const expiredCreator = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });
    const { appId: expiredAppId, appAddress: expiredAppAddress } = await deployContract(algod, expiredCreator);

    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: expiredCreator.addr,
      receiver: expiredAppAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: expiredAppId,
      method: loadContract().getMethodByName("createVote"),
      methodArgs: [now + BigInt(60), 2, STAKE, { txn: mbrPayment, signer: expiredCreator.signer }],
      sender: expiredCreator.addr,
      signer: expiredCreator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    const result = await createAtc.execute(algod, 4);
    const expiredVoteId = Number(result.methodResults[0].returnValue);

    await forwardToAfterVotePhase(algod, expiredAppId, expiredVoteId, expiredCreator, fixture, 'pollEnd');

    const voteParams = await algod.getTransactionParams().do();

    const voteMbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: expiredAppAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: voteParams,
    });

    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: expiredAppId,
      method: loadContract().getMethodByName("vote"),
      methodArgs: [expiredVoteId, 0, { txn: voteMbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: voteParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(expiredVoteId) },
        { appIndex: 0, name: generateUserVoteBoxName(expiredVoteId, voter.addr) },
      ],
    });

    await expect(voteAtc.execute(algod, 4)).rejects.toThrow();
  });
});