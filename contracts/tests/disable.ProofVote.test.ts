import algosdk from "algosdk";
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing";
import { AlgoAmount } from "@algorandfoundation/algokit-utils/types/amount";
import { deployContract, loadContract } from "./helpers/deploy";
import { generateVoteBoxName, generateUserVoteBoxName } from "./helpers/boxes";
import { latestTimestamp, forwardToAfterVotePhase, registerTimestampResetAfterEach } from "./helpers/time";
import { VOTE_BOX_MBR, USER_VOTE_BOX_MBR } from "../src/constants";
import { STAKE } from "./testConstants";
import { TestAccount } from "./types";

const fixture = algorandFixture();
beforeEach(fixture.newScope);
registerTimestampResetAfterEach(() => fixture.context.algod);

describe("disable", () => {
  let appId: number;
  let appAddress: string;
  let creator: TestAccount;
  let voter: TestAccount;
  let contract: algosdk.ABIContract;

  beforeEach(async () => {
    const { algod, generateAccount } = fixture.context;

    creator = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });
    voter = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });

    ({ appId, appAddress } = await deployContract(algod, creator, { minStake: 100_000, defaultWithdrawWindow: 2 }));
    contract = loadContract();
  });

  async function callDisable(sender: TestAccount): Promise<void> {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("disable"),
      methodArgs: [],
      sender: sender.addr,
      signer: sender.signer,
      suggestedParams,
    });
    await atc.execute(algod, 4);
  }

  async function createPoll(endOffset = BigInt(100)): Promise<number> {
    const { algod } = fixture.context;
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
      methodArgs: [now + endOffset, 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    const result = await atc.execute(algod, 4);
    return Number(result.methodResults[0].returnValue);
  }

  // The platform owner (deployer) should be able to disable the contract, 
  // which blocks new votes from being created and prevents voting on existing polls. 
  // This test calls disable and expects it to succeed without throwing an error.
  it("allows platformOwner to disable the contract", async () => {
    await expect(callDisable(creator)).resolves.not.toThrow();
  });

  // Only the platform owner (deployer) should be able to disable the contract. 
  // This test tries to call disable from a different account and expects it to fail.
  it("rejects disable by non-owner", async () => {
    const { generateAccount } = fixture.context;
    const notOwner = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    await expect(callDisable(notOwner)).rejects.toThrow();
  });

  // After the contract is disabled, attempts to create a new vote should fail.
  it("blocks createVote after disable", async () => {
    await callDisable(creator);

    const { algod } = fixture.context;
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
      methodArgs: [now + BigInt(100), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // After the contract is disabled, attempts to vote on an existing poll should fail.
  it("blocks vote after disable", async () => {
    const voteId = await createPoll();
    await callDisable(creator);

    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: payment, signer: voter.signer }],
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

  // Disabling the contract should not prevent voters from withdrawing their stake after the vote ends.
  it("still allows withdraw after disable", async () => {
    const voteId = await createPoll();

    const { algod } = fixture.context;
    const voteSuggestedParams = await algod.getTransactionParams().do();

    const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: voteSuggestedParams,
    });

    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: payment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: voteSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await voteAtc.execute(algod, 4);

    await callDisable(creator);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'pollEnd');

    const withdrawSuggestedParams = await algod.getTransactionParams().do();
    withdrawSuggestedParams.flatFee = true;
    withdrawSuggestedParams.fee = BigInt(2000);
    const withdrawAtc = new algosdk.AtomicTransactionComposer();
    withdrawAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [voteId],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: withdrawSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });

    await expect(withdrawAtc.execute(algod, 4)).resolves.not.toThrow();
  });

  // Disabling the contract should not prevent the platform owner from sweeping unwithdrawn stakes after the withdraw deadline.
  it("still allows sweepUser after disable", async () => {
    const voteId = await createPoll();

    const { algod } = fixture.context;
    const voteSuggestedParams = await algod.getTransactionParams().do();

    const payment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: voter.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams: voteSuggestedParams,
    });

    const voteAtc = new algosdk.AtomicTransactionComposer();
    voteAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [voteId, 0, { txn: payment, signer: voter.signer }],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: voteSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(voteId) },
        { appIndex: 0, name: generateUserVoteBoxName(voteId, voter.addr) },
      ],
    });
    await voteAtc.execute(algod, 4);

    await callDisable(creator);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'withdrawDeadline');

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

    await expect(sweepAtc.execute(algod, 4)).resolves.not.toThrow();
  });
});
