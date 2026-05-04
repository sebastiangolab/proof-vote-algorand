import algosdk from "algosdk";
import path from "path";
import fs from "fs";
import { ARTIFACTS_DIR } from "../testConstants";

/**
 * Deploys the ProofVote contract to LocalNet.
 * Reads compiled TEAL files from artifacts/, compiles them via algod,
 * then calls createApplication through the ABI.
 * Returns the appId and appAddress of the newly created contract.
 * Requires `npm run build` to have been run first.
 *
 * @param algod     - Algod client (LocalNet)
 * @param deployer  - Deployer account (becomes platformOwner)
 * @param params    - Initial stake parameters
 * @returns { appId, appAddress } — numerical app ID and contract escrow address
 */
export async function deployContract(
  algod: algosdk.Algodv2,
  deployer: algosdk.Account,
  params: {
    defaultStake?: number;
    minStake?: number;
    maxStake?: number;
    defaultWithdrawWindow?: number;
  } = {}
): Promise<{ appId: number; appAddress: string }> {
  // Set default parameters if not provided
  const {
    defaultStake = 1_000_000,  // 1 ALGO
    minStake = 500_000,        // 0.5 ALGO
    maxStake = 10_000_000,     // 10 ALGO
    defaultWithdrawWindow = 86_400, // 1 day
  } = params;

  // Read and compile TEAL sources from artifacts
  const approvalSource = fs.readFileSync(
    path.join(ARTIFACTS_DIR, "ProofVote.approval.teal"),
    "utf-8"
  );
  const clearSource = fs.readFileSync(path.join(ARTIFACTS_DIR, "ProofVote.clear.teal"), "utf-8");

  // Compile TEAL to bytecode using algod's compile endpoint
  const [compiledApproval, compiledClear] = await Promise.all([
    algod.compile(approvalSource).do(),
    algod.compile(clearSource).do(),
  ]);

  // Convert base64-encoded bytecode to Uint8Array for deployment
  const approvalProgram = new Uint8Array(Buffer.from(compiledApproval.result as string, "base64"));
  const clearProgram = new Uint8Array(Buffer.from(compiledClear.result as string, "base64"));

  // Load ABI contract from ARC-32 JSON
  const arc32 = JSON.parse(
    fs.readFileSync(path.join(ARTIFACTS_DIR, "ProofVote.arc32.json"), "utf-8")
  ) as { contract: algosdk.ABIContractParams };

  // Create an ABIContract instance from the loaded definition
  const contract = new algosdk.ABIContract(arc32.contract);

  // Get the createApplication method from the ABI
  const createMethod = contract.getMethodByName("createApplication");

  // Signer for the deployer account
  const signer = algosdk.makeBasicAccountTransactionSigner(deployer);

  // Get suggested params for the transaction
  const suggestedParams = await algod.getTransactionParams().do();

  // Create an AtomicTransactionComposer to call the createApplication method
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: 0,
    method: createMethod,
    methodArgs: [defaultStake, minStake, maxStake, defaultWithdrawWindow],
    sender: deployer.addr,
    signer,
    suggestedParams,
    approvalProgram,
    clearProgram,
    // Global state: platformOwner (bytes=1), defaultStake/minStake/maxStake/defaultWithdrawWindow/nextVoteId (ints=5)
    numGlobalByteSlices: 1,
    numGlobalInts: 5,
    numLocalByteSlices: 0,
    numLocalInts: 0,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  });

  // Execute the transaction group and wait for confirmation
  const result = await atc.execute(algod, 4);
  const txId = result.txIDs[0];
  const confirmation = await algosdk.waitForConfirmation(algod, txId, 4);
  const appId = Number(confirmation.applicationIndex);
  const appAddress = algosdk.getApplicationAddress(appId).toString();

  // Fund the app account with its base minimum balance (100,000 µALGO).
  // Without this, any subsequent call that sends only the box MBR (60,500 µALGO)
  // will leave the app account below the protocol minimum, causing the transaction
  // pool to reject the group before it even executes.
  const fundParams = await algod.getTransactionParams().do();
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: deployer.addr,
    receiver: appAddress,
    amount: 100_000,
    suggestedParams: fundParams,
  });
  const fundSigned = fundTxn.signTxn(deployer.sk);
  const { txid: fundTxId } = await algod.sendRawTransaction(fundSigned).do();
  await algosdk.waitForConfirmation(algod, fundTxId, 4);

  return { appId, appAddress };
}

/**
 * Loads the ABI contract definition from ProofVote.arc32.json.
 * Useful when you want to call contract methods without redeploying it.
 * Requires `npm run build` to have been run.
 */
export function loadContract(): algosdk.ABIContract {
  const arc32 = JSON.parse(
    fs.readFileSync(path.join(ARTIFACTS_DIR, "ProofVote.arc32.json"), "utf-8")
  ) as { contract: algosdk.ABIContractParams };

  return new algosdk.ABIContract(arc32.contract);
}
