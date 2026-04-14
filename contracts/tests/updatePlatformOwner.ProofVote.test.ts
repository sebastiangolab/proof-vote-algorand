
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

    // Create an AtomicTransactionComposer to call the updatePlatformOwner method, passing the new owner's address as an argument.
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

    // The owner address is stored as bytes in global state, so we decode it back to an Algorand address string for comparison.
    const storedAddr = algosdk.encodeAddress(ownerEntry!.value.bytes);
    expect(storedAddr).toBe(newOwner.addr.toString());
  });

  // Tests that a non-owner cannot transfer ownership, and that the contract correctly rejects the transaction.
  it("rejects ownership transfer by non-owner", async () => {
    const { algod, generateAccount } = fixture.context;
    const nonOwner = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const target = await generateAccount({ initialFunds: AlgoAmount.Algos(10), suppressLog: true });
    const suggestedParams = await algod.getTransactionParams().do();

    // Set flat fee to ensure we know the exact fee amount for balance assertions (and to avoid fee fluctuations affecting the test)
    suggestedParams.flatFee = true;
    // 2000 microAlgos is a common fee for a 2-call transaction, but adjust as needed based on your network conditions
    suggestedParams.fee = BigInt(2000); 

    // Create an AtomicTransactionComposer to call the updatePlatformOwner method from a non-owner account, which should be rejected by the contract.
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
});