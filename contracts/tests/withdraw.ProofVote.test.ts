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
const fixture = algorandFixture();
beforeEach(fixture.newScope);
registerTimestampResetAfterEach(() => fixture.context.algod);

describe("withdraw", () => {
  let appId: number;
  let appAddress: string;
  let creator: TestAccount;
  let voter: TestAccount;
  let contract: algosdk.ABIContract;
  let voteId: number;

  // Helper: vote as `v` on `vid`
  async function castVote(v: TestAccount, vid: number, choice = 0): Promise<void> {
    const { algod } = fixture.context;

    const suggestedParams = await algod.getTransactionParams().do();

    // Create mbr payment txn to cover the MBR for the UserVoteState box that will be created when voting
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: v.addr,
      receiver: appAddress,
      amount: STAKE + USER_VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the vote method with the mbrPayment as an inner transaction to fund the UserVoteState box creation
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("vote"),
      methodArgs: [vid, choice, { txn: mbrPayment, signer: v.signer }],
      sender: v.addr,
      signer: v.signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(vid) },
        { appIndex: 0, name: generateUserVoteBoxName(vid, v.addr) },
      ],
    });
    await atc.execute(algod, 4);
  }

  // Generates a funded test accounts and deploys the ProofVote contract before each test
  beforeEach(async () => {
    const { algod, generateAccount } = fixture.context;

    creator = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });
    voter = await generateAccount({ initialFunds: AlgoAmount.Algos(50), suppressLog: true });

    ({ appId, appAddress } = await deployContract(algod, creator, { minStake: 100_000 }));
    contract = loadContract();
  });

  // Tests for the withdraw method, which allows voters to withdraw their stake and MBR after a poll ends, but within a specified withdrawal window.
  it("refunds STAKE + MBR after vote ends, within deadline", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);
    const suggestedParams = await algod.getTransactionParams().do();

    /** Create poll */

    // Create mbr payment txn to fund the VoteBox creation, which is required to create the poll.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method, passing the mbrPayment as an inner transaction to fund the VoteBox creation, 
    // and specifying a withdraw window that is open for a sufficient time after the poll end time to allow for withdrawal in this test.
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

    voteId = Number(result.methodResults[0].returnValue);

    // Vote while poll is open
    await castVote(voter, voteId);

    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'pollEnd');

    /** Withdraw */

    // Get voter balance before withdraw
    const voterAmountBefore = (await algod.accountInformation(voter.addr).do()).amount as bigint;

    // Set flat fee to ensure we know the exact fee amount for balance assertions (and to avoid fee fluctuations affecting the test)
    const withdrawSuggestedParams = await algod.getTransactionParams().do();
    withdrawSuggestedParams.flatFee = true;
    // 2000 microAlgos is a common fee for a 2-call transaction, but adjust as needed based on your network conditions
    withdrawSuggestedParams.fee = BigInt(2000);

    // Create an AtomicTransactionComposer to call the withdraw method, passing the voteId and the required boxes.
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
    await withdrawAtc.execute(algod, 4);

    const voterAmountAfter = (await algod.accountInformation(voter.addr).do()).amount as bigint;
    // Should receive back exactly STAKE + USER_VOTE_BOX_MBR minus the flat tx fee (2000 µALGO)
    expect(voterAmountAfter).toBe(voterAmountBefore + BigInt(STAKE) + BigInt(USER_VOTE_BOX_MBR) - 2000n);

    // UserVoteState box should be deleted after withdrawal, so fetching user state should return null
    const userState = await fetchUserVoteState(algod, appId, voteId, voter.addr);
    expect(userState).toBeNull();
  });

  // Tests that withdrawal fails if attempted after the withdraw deadline has passed (i.e. too late to withdraw)
  it("rejects withdrawal when window is closed (after withdrawDeadline)", async () => {
    const { algod } = fixture.context;

    // Deploy with defaultWithdrawWindow = 2s so the withdrawal deadline passes quickly.
    ({ appId, appAddress } = await deployContract(algod, creator, {
      minStake: 100_000,
      defaultWithdrawWindow: 2,
    }));
    
    const now = await latestTimestamp(fixture);

    /** Create poll */

    const suggestedParams = await algod.getTransactionParams().do();

    // Create mbr payment to fund the VoteBox creation, which is required to create the poll.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method, passing the mbrPayment as an inner transaction to fund the VoteBox creation, 
    // and specifying a withdraw window that is open for a sufficient time after the poll end time to allow for withdrawal in this test.
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
    voteId = Number(result.methodResults[0].returnValue);

    // Vote while poll is open
    await castVote(voter, voteId);

    // Forward time to after the withdraw deadline by mining blocks
    await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'withdrawDeadline');

    /** Withdraw */

    const withdrawSuggestedParams = await algod.getTransactionParams().do();

    // Create an AtomicTransactionComposer to call the withdraw method, passing the voteId and the required boxes.
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
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

    // Attempting to withdraw after the withdraw deadline should fail
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Test that a user who did not vote (and therefore does not have a UserVoteState box) cannot withdraw
  it("rejects withdrawal when user did not vote (no UserVoteState box)", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);

    /** Create poll */

    const suggestedParams = await algod.getTransactionParams().do();
    
    // Create mbr payment to fund the VoteBox creation, which is required to create the poll.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method, passing the mbrPayment as an inner transaction to fund the VoteBox creation,
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

    // Forward time to after the poll end (but still within the withdraw window) by mining blocks
    await forwardToAfterVotePhase(algod, appId, 1, creator, fixture, 'pollEnd');

    /** Withdraw */

    const withdrawSuggestedParams = await algod.getTransactionParams().do();

    // Create an AtomicTransactionComposer to call the withdraw method, passing the voteId and the required boxes. 
    // The user did not vote, so they do not have a UserVoteState box, and the withdraw should fail.
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [1],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: withdrawSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    // Expecting the withdraw to fail because the user did not vote and therefore does not have a UserVoteState box
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Test that a user cannot withdraw twice, after they have already withdrawn once and their UserVoteState box has been deleted, 
  // attempting to withdraw again should fail because the box is gone
  it("rejects a second withdrawal (box deleted after first)", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);

    /** Create poll */

    const suggestedParams = await algod.getTransactionParams().do();

    // Create mbr payment to fund the VoteBox creation, which is required to create the poll.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method, passing the mbrPayment as an inner transaction to fund the VoteBox creation,
    // and specifying a withdraw window that is open for a sufficient time after the poll end time to allow for withdrawal in this test.
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
    voteId = Number(result.methodResults[0].returnValue);

    // Vote while poll is open
    await castVote(voter, voteId);

    // Forward time to after the poll end (but still within the withdraw window) by mining blocks
   await forwardToAfterVotePhase(algod, appId, voteId, creator, fixture, 'pollEnd');

    // Helper function to create and execute a withdraw transaction, which we will call twice to test
    // that the second withdrawal fails because the UserVoteState box is deleted after the first withdrawal
    const makeWithdrawAtc = async () => {
      const { algod: a } = fixture.context;

      // Set flat fee to ensure we know the exact fee amount for balance assertions (and to avoid fee fluctuations affecting the test)
      const withdrawSuggestedParams = await a.getTransactionParams().do();
      withdrawSuggestedParams.flatFee = true;
      // 2000 microAlgos is a common fee for a 2-call transaction, but adjust as needed based on your network conditions
      withdrawSuggestedParams.fee = BigInt(2000);

      // Create an AtomicTransactionComposer to call the withdraw method, passing the voteId and the required boxes.
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
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

      return atc;
    };

    // First withdrawal — succeeds
    await (await makeWithdrawAtc()).execute(algod, 4);
    
    // Second withdrawal — box is gone → fails
    await expect((await makeWithdrawAtc()).execute(algod, 4)).rejects.toThrow();
  });

  // Test that withdrawal fails if the poll is still active (voting has not ended yet)
  it("rejects withdrawal when poll is still active (before endAt)", async () => {
    const { algod } = fixture.context;
    const now = await latestTimestamp(fixture);

    /** Create poll */

    const suggestedParams = await algod.getTransactionParams().do();

    // Create mbr payment to fund the VoteBox creation, which is required to create the poll.
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddress,
      amount: VOTE_BOX_MBR,
      suggestedParams,
    });

    // Create an AtomicTransactionComposer to call the createVote method, passing the mbrPayment as an inner transaction to fund the VoteBox creation,
    // and specifying an endAt that is in the future so the poll is still active when we attempt to withdraw.
    const createAtc = new algosdk.AtomicTransactionComposer();
    createAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("createVote"),
      methodArgs: [now + BigInt(3600), 2, STAKE, { txn: mbrPayment, signer: creator.signer }],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
      boxes: [{ appIndex: 0, name: generateVoteBoxName(1) }],
    });
    await createAtc.execute(algod, 4);

    // Cast a vote while the poll is open
    await castVote(voter, 1);

    /** Withdrawal */

    // Attempt to withdraw immediately — poll is still active (endAt not reached)
    const withdrawSuggestedParams = await algod.getTransactionParams().do();

    // Create an AtomicTransactionComposer to call the withdraw method, passing the voteId and the required boxes.
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [1],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams: withdrawSuggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(1) },
        { appIndex: 0, name: generateUserVoteBoxName(1, voter.addr) },
      ],
    });

    // Expecting the withdraw to fail because the poll is still active (endAt not reached)
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Test that withdrawal fails when the voteId does not exist (no VoteState box)
  it("rejects withdrawal for a non-existent voteId", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    // Attempt to withdraw using a voteId that does not exist
    const nonExistentVoteId = 9999;

    // Create an AtomicTransactionComposer to call the withdraw method, 
    // passing the non-existent voteId and the required boxes (which also won't exist).
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("withdraw"),
      methodArgs: [nonExistentVoteId],
      sender: voter.addr,
      signer: voter.signer,
      suggestedParams,
      boxes: [
        { appIndex: 0, name: generateVoteBoxName(nonExistentVoteId) },
        { appIndex: 0, name: generateUserVoteBoxName(nonExistentVoteId, voter.addr) },
      ],
    });

    // Expecting the withdraw to fail because the voteId does not exist (no VoteState box, and consequently no UserVoteState box)
    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });
});