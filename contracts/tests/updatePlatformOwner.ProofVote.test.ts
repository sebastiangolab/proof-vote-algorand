
import algosdk from "algosdk";
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing";
import { AlgoAmount } from "@algorandfoundation/algokit-utils/types/amount";
import { deployContract, loadContract } from "./helpers/deploy";
import { TestAccount } from "./types";

// Provides an isolated Algorand sandbox environment (algod client, funded accounts) and resets
// blockchain state before each test via fixture.newScope, preventing test cross-contamination.
const fixture = algorandFixture();
beforeEach(fixture.newScope);

describe("updatePlatformOwner", () => {
  let appId: number;
  let creator: TestAccount;
  let contract: algosdk.ABIContract;

  // Generates a funded test account and deploys the ProofVote contract before each test
  beforeEach(async () => {
    const { algod, generateAccount } = fixture.context;

    creator = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });

    ({ appId } = await deployContract(algod, creator));
    contract = loadContract();
  });

  // Tests that the current platform owner can successfully transfer ownership to a new address, 
  // and that the new owner is correctly stored in the contract's global state.
  it("lets platformOwner transfer ownership to a new address", async () => {
    const { algod, generateAccount } = fixture.context;
    const newOwner = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const suggestedParams = await algod.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [newOwner.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
    });
    await atc.execute(algod, 4);

    // Verify the new owner is stored in global state
    const appInfo = await algod.getApplicationByID(appId).do();
    const ownerEntry = appInfo.params.globalState?.find(
      (kv) => Buffer.from(kv.key).toString() === "platformOwner"
    );
    expect(ownerEntry).toBeDefined();

    const storedAddr = algosdk.encodeAddress(ownerEntry!.value.bytes);
    expect(storedAddr).toBe(newOwner.addr.toString());
  });

  // Tests that a non-owner cannot transfer ownership, and that the contract correctly rejects the transaction.
  it("rejects ownership transfer by non-owner", async () => {
    const { algod, generateAccount } = fixture.context;
    const nonOwner = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const target = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const suggestedParams = await algod.getTransactionParams().do();

    suggestedParams.flatFee = true;
    suggestedParams.fee = BigInt(2000);

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [target.addr],
      sender: nonOwner.addr,
      signer: nonOwner.signer,
      suggestedParams,
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests the "invalid owner address" assertion: the zero address must be rejected as a new owner.
  it("rejects when newOwner is the zero address", async () => {
    const { algod } = fixture.context;
    const suggestedParams = await algod.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [algosdk.Address.zeroAddress()],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams,
    });

    await expect(atc.execute(algod, 4)).rejects.toThrow();
  });

  // Tests that after ownership is transferred, the new owner can call owner-only methods
  // and the previous owner is rejected.
  it("new owner can call owner-only methods; old owner cannot", async () => {
    const { algod, generateAccount } = fixture.context;
    const newOwner = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });

    // Transfer ownership to newOwner
    const transferParams = await algod.getTransactionParams().do();
    const transferAtc = new algosdk.AtomicTransactionComposer();
    transferAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [newOwner.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: transferParams,
    });
    await transferAtc.execute(algod, 4);

    // New owner successfully calls an owner-only method (disable)
    const disableParams = await algod.getTransactionParams().do();
    const disableAtc = new algosdk.AtomicTransactionComposer();
    disableAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("disable"),
      methodArgs: [],
      sender: newOwner.addr,
      signer: newOwner.signer,
      suggestedParams: disableParams,
    });
    await expect(disableAtc.execute(algod, 4)).resolves.not.toThrow();

    // Old owner is now rejected when calling an owner-only method
    const oldOwnerParams = await algod.getTransactionParams().do();
    const oldOwnerAtc = new algosdk.AtomicTransactionComposer();
    oldOwnerAtc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("updatePlatformOwner"),
      methodArgs: [creator.addr],
      sender: creator.addr,
      signer: creator.signer,
      suggestedParams: oldOwnerParams,
    });
    await expect(oldOwnerAtc.execute(algod, 4)).rejects.toThrow();
  });
});