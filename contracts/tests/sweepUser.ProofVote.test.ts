import algosdk from "algosdk";
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing";
import { AlgoAmount } from "@algorandfoundation/algokit-utils/types/amount";
import { deployContract, loadContract } from "./helpers/deploy";
import { generateVoteBoxName, generateUserVoteBoxName, fetchUserVoteState } from "./helpers/boxes";
import { latestTimestamp, forwardToAfterVotePhase, registerTimestampResetAfterEach } from "./helpers/time";
import { VOTE_BOX_MBR, USER_VOTE_BOX_MBR } from "../src/constants";
import { STAKE } from "./testConstants";
import { TestAccount } from "./types";

// Provides an isolated Algorand sandbox environment (algod client, funded accounts) and resets
// blockchain state before each test via fixture.newScope, preventing test cross-contamination.
export const fixture = algorandFixture();
beforeEach(fixture.newScope);
registerTimestampResetAfterEach(() => fixture.context.algod);

describe("sweepUser", () => {
  let appId: number;
  let appAddress: string;
  let creator: TestAccount;
  let voter: TestAccount;
  let contract: algosdk.ABIContract;

  // Generates a funded test accounts and deploys the ProofVote contract before each test
  beforeEach(async () => {
    const { algod, generateAccount } = fixture.context;

    creator = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });
    voter = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });

    ({ appId, appAddress } = await deployContract(algod, creator, { minStake: 100_000, defaultWithdrawWindow: 2 }));
    contract = loadContract();
  });

  // Tests that the platform owner can successfully sweep a user's stake after the withdrawal deadline has passed,
  // and that the user's vote box is deleted. Also checks that the platform owner receives the swept funds.
  it("lets platformOwner sweep after withdrawal deadline", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(100), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    const result = await createAtc.execute(algod, 4);

    const voteId = Number(result.methodResults[0].returnValue);


    const voteSuggestedParams = await algod.getTransactionParams().do();

    const voteMbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: voteSuggestedParams,
    });

    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: voteMbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: voteSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await voteAtc.execute(algod, 4);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'withdrawDeadline');

    
    const amountBefore = (await algod.accountInformation(creator.addr).do()).amount as bigint;

    const sweepSuggestedParams = await algod.getTransactionParams().do();
    sweepSuggestedParams.flatFee = true;
    sweepSuggestedParams.fee = BigInt(2000); 

    const sweepAtc = new algosdk.AtomicTransactionComposer();
    sweepAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [voteId, voter.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: sweepSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await sweepAtc.execute(algod, 4);

    const amountAfter = (await algod.accountInformation(creator.addr).do()).amount as bigint;
    expect(amountAfter).toBeGreaterThan(amountBefore);

    const userState = await fetchUserVoteState(algod, appId, voteId, voter.addr);
    expect(userState).toBeNull();
  });

  // Tests that a non-owner cannot sweep a user's stake, and that sweeping is not allowed before the withdrawal deadline has passed.
  it("rejects sweep by non-owner", async () => {
    const { algod, generateAccount } = fixture.context;
    const notOwnerAccount = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(2), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);

    const sweepSuggestedParams = await algod.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [1, voter.addr],
      sender: notOwnerAccount.addr,
      signer: notOwnerAccount.signer,
      suggestedParams: sweepSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });


  // Tests that sweeping fails when the given voteId has never been created.
  it("rejects sweep for non-existent voteId", async () => {
    const { algod } = fixture.context;
    const sweepSuggestedParams = await algod.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [999, voter.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: sweepSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(999) },
        { appIndex: 0, name: generateUserVoteBoxName(999, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that sweeping fails when the target user never cast a vote (no user box exists).
  it("rejects sweep for user who never voted", async () => {
    const { algod, generateAccount } = fixture.context;
    const nonVoter = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(2), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const result = await createAtc.execute(algod, 4);

    const voteId = Number(result.methodResults[0].returnValue);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'withdrawDeadline');

    const sweepSuggestedParams = await algod.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [voteId, nonVoter.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: sweepSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, nonVoter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that sweeping is not allowed before the withdrawal deadline has passed.
  it("rejects sweep before withdrawal deadline", async () => {
    const { algod } = fixture.context;

    // Deploy with a 1-year withdrawal window so deadline is far in the future when we try to sweep.
    ({ appId, appAddress } = await deployContract(algod, creator, {
      minStake: 100_000,
      defaultWithdrawWindow: 31_536_000,
    }));

    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(2), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);

    const sweepSuggestedParams = await algod.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [1, voter.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: sweepSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

    // Tests that once a user's vote box has been swept and deleted, it cannot be swept again,
  // ensuring that the sweepUser method properly handles attempts to sweep non-existent boxes.
  it("rejects a second sweep after the first already deleted the box", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(10), 2, STAKE, { txn: mbrPay, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const result = await createAtc.execute(algod, 4);

    const voteId = Number(result.methodResults[0].returnValue);

    const voteSuggestedParams = await algod.getTransactionParams().do();
    voteSuggestedParams.flatFee = true;
    voteSuggestedParams.fee = BigInt(2000);
    
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: voteSuggestedParams,
    });

    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: mbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: voteSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await voteAtc.execute(algod, 4);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'withdrawDeadline');


    const makeSweepAtc = async () => {
      const { algod: a } = fixture.context;

      const sweepSuggestedParams = await a.getTransactionParams().do();
      sweepSuggestedParams.flatFee = true;
      sweepSuggestedParams.fee = BigInt(2000); 

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: appId,
        method: contract.getMethodByName("sweepUser"),
        methodArgs: [voteId, voter.addr],
        sender: creator.addr,
        signer: creator.signer,
        suggestedParams: sweepSuggestedParams,
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

  // Tests that the platformOwner receives exactly STAKE + USER_VOTE_BOX_MBR minus the flat transaction fee.
  // The existing success test only checked amountAfter > amountBefore.
  it("sweeps exact STAKE + USER_VOTE_BOX_MBR minus fee to platformOwner", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(100), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    const createResult = await createAtc.execute(algod, 4);
    
    const voteId = Number(createResult.methodResults[0].returnValue);

    const voteParams = await algod.getTransactionParams().do();
    const voteMbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: voteParams,
    });

    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: voteMbrPayment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: voteParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });

    await voteAtc.execute(algod, 4);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'withdrawDeadline');

    const amountBefore = (await algod.accountInformation(creator.addr).do()).amount as bigint;

    const sweepParams = await algod.getTransactionParams().do();
    sweepParams.flatFee = true;
    sweepParams.fee = BigInt(2000);

    const sweepAtc = new algosdk.AtomicTransactionComposer();
    sweepAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("sweepUser"),
      methodArgs: [voteId, voter.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: sweepParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await sweepAtc.execute(algod, 4);

    const amountAfter = (await algod.accountInformation(creator.addr).do()).amount as bigint;
    expect(amountAfter).toBe(amountBefore + BigInt(STAKE) + BigInt(USER_VOTE_BOX_MBR) - 2000n);
  });
});