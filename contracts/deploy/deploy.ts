/**
 * Deployment script for ProofVote smart contract.
 *
 * Usage:
 *   cd contracts
 *   cp .env.example .env      # fill in DEPLOYER_MNEMONIC
 *   npm run build             # compile TEAL → artifacts/
 *   npm run deploy            # run this script
 *
 * Outputs APP_ID and APP_ADDRESS to stdout and to .deploy-result.json
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import algosdk from "algosdk";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ─── Config ───────────────────────────────────────────────────────────────────

const ALGOD_SERVER = process.env.ALGOD_SERVER ?? "https://testnet-api.algonode.cloud";
const ALGOD_PORT = Number(process.env.ALGOD_PORT ?? 443);
const ALGOD_TOKEN = process.env.ALGOD_TOKEN ?? "";
const DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC ?? "";

if (!DEPLOYER_MNEMONIC) {
  console.error("ERROR: DEPLOYER_MNEMONIC is not set in .env");
  process.exit(1);
}

if (DEPLOYER_MNEMONIC.trim().split(/\s+/).length !== 25) {
  console.error("ERROR: DEPLOYER_MNEMONIC must be exactly 25 words");
  process.exit(1);
}

// ─── Default deploy parameters ────────────────────────────────────────────────

/** 1 ALGO in µALGO */
const DEFAULT_STAKE = 1_000_000n;
/** 0.5 ALGO minimum stake */
const MIN_STAKE = 500_000n;
/** 10 ALGO maximum stake */
const MAX_STAKE = 10_000_000n;
/** 7 days in seconds */
const DEFAULT_WITHDRAW_WINDOW = 7n * 24n * 3600n;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAlgodClient(): algosdk.Algodv2 {
  return new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
}

async function compileProgram(algod: algosdk.Algodv2, source: string): Promise<Uint8Array> {
  const compiled = await algod.compile(source).do();
  return new Uint8Array(Buffer.from(compiled.result as string, "base64"));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function deploy(): Promise<void> {
  // Initialize Algod client and deployer account
  const algod = getAlgodClient();
  const deployer = algosdk.mnemonicToSecretKey(DEPLOYER_MNEMONIC);
  const signer = algosdk.makeBasicAccountTransactionSigner(deployer);

  console.log(`Deployer address : ${deployer.addr}`);

  // Check balance
  const accountInfo = await algod.accountInformation(deployer.addr).do();
  const balance = Number(accountInfo["amount"]) / 1_000_000;

  console.log(`Deployer balance : ${balance} ALGO`);

  // Require at least 0.5 ALGO to cover fees and minimum balance for creation
  if (balance < 0.5) {
    console.error("ERROR: Deployer balance too low (< 0.5 ALGO). Fund via TestNet dispenser.");
    process.exit(1);
  }

  // Load compiled TEAL from artifacts
  const artifactsDir = path.join(__dirname, "..", "artifacts");
  const approvalSource = fs.readFileSync(
    path.join(artifactsDir, "ProofVote.approval.teal"),
    "utf-8"
  );
  const clearSource = fs.readFileSync(path.join(artifactsDir, "ProofVote.clear.teal"), "utf-8");

  // Compile both programs
  console.log("Compiling TEAL programs...");

  const [approvalProgram, clearProgram] = await Promise.all([
    compileProgram(algod, approvalSource),
    compileProgram(algod, clearSource),
  ]);

  // Load ABI contract from ARC-32 spec
  const arc32 = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "ProofVote.arc32.json"), "utf-8")
  ) as { contract: object };

  // Create an ABIContract instance from the loaded definition
  const contract = new algosdk.ABIContract(arc32.contract as algosdk.ABIContractParams);

  // Get the createApplication method from the ABI
  const createMethod = contract.getMethodByName("createApplication");

  // Raw arguments for createApplication — ATC encodes these automatically
  const abiArgs = [
    DEFAULT_STAKE,
    MIN_STAKE,
    MAX_STAKE,
    DEFAULT_WITHDRAW_WINDOW,
  ];

  // Get suggested params for the transaction
  const suggestedParams = await algod.getTransactionParams().do();

  // Override fee to cover creation + ABI routing (minimum 2000 µALGO):
  //   • 1000 µALGO — fee for the outer app-create transaction itself
  //   • 1000 µALGO — covers the inner transaction fee incurred by the
  //     ARC-4 router when dispatching the `create` ABI method
  // We use the network's minFee as the floor in case it ever exceeds 1000 µALGO.
  suggestedParams.flatFee = true;
  suggestedParams.fee = suggestedParams.minFee != null && suggestedParams.minFee * 2n > 2000n
    ? suggestedParams.minFee * 2n
    : 2000n;

  // Create an AtomicTransactionComposer to call the createApplication method
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: 0, // 0 = create new application
    method: createMethod,
    methodArgs: abiArgs,
    sender: deployer.addr,
    signer,
    suggestedParams,
    approvalProgram,
    clearProgram,
    numGlobalByteSlices: 1,
    numGlobalInts: 5,
    numLocalByteSlices: 0,
    numLocalInts: 0,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  });

  // Execute the transaction and wait for confirmation
  console.log("Deploying contract...");
  
  const result = await atc.execute(algod, 4);
  const txId = result.txIDs[0];
  const confirmation = await algosdk.waitForConfirmation(algod, txId, 4);
  const appId = confirmation.applicationIndex!;
  const appAddress = algosdk.getApplicationAddress(appId);

  // Seed the app account with the Algorand base minimum balance (100,000 µALGO).
  // Every Algorand account must hold this regardless of boxes — without it the
  // very first createVote call would fail because the MBR payment from the user
  // only covers the box cost, not the base account minimum.
  const BASE_MIN_BALANCE = 100_000n;
  const seedParams = await algod.getTransactionParams().do();
  const seedTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: deployer.addr,
    receiver: appAddress,
    amount: BASE_MIN_BALANCE,
    suggestedParams: seedParams,
  });
  const seedTxId = (await algod.sendRawTransaction(seedTxn.signTxn(deployer.sk)).do()).txid;
  await algosdk.waitForConfirmation(algod, seedTxId, 4);

  console.log(`\n✅ Contract deployed successfully`);
  console.log(`   APP_ID         : ${appId}`);
  console.log(`   APP_ADDRESS    : ${appAddress}`);
  console.log(`   Platform owner : ${deployer.addr}`);
  console.log(`   Txn            : ${txId}`);
  console.log(`   Seed txn       : ${seedTxId}`);
  console.log(`\nAdd to web/.env:\n  NEXT_PUBLIC_APP_ID=${appId}\n  NEXT_PUBLIC_PLATFORM_OWNER_ADDRESS=${deployer.addr}\n`);

  // Save result for CI/scripting
  const resultPath = path.join(__dirname, "..", ".deploy-result.json");
  fs.writeFileSync(
    resultPath,
    JSON.stringify(
      { appId: appId.toString(), appAddress: appAddress.toString(), txId, network: process.env.ALGORAND_NETWORK ?? "testnet" },
      null,
      2
    )
  );
  
  console.log(`Deploy result saved to ${resultPath}`);
}

deploy().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
