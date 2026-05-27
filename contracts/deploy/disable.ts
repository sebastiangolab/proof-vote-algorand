/**
 * Calls the `disable` method on a deployed ProofVote contract.
 *
 * Usage:
 *   cd contracts
 *   APP_ID=<id> npm run disable
 *
 * Reads DEPLOYER_MNEMONIC and ALGOD_* from .env (same as deploy.ts).
 * Only the platform owner (deployer) can call this method.
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import algosdk from "algosdk";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const ALGOD_SERVER = process.env.ALGOD_SERVER ?? "https://testnet-api.algonode.cloud";
const ALGOD_PORT = Number(process.env.ALGOD_PORT ?? 443);
const ALGOD_TOKEN = process.env.ALGOD_TOKEN ?? "";
const DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC ?? "";
const APP_ID = Number(process.env.APP_ID ?? 0);

if (!DEPLOYER_MNEMONIC) {
  console.error("ERROR: DEPLOYER_MNEMONIC is not set in .env");
  process.exit(1);
}

if (!APP_ID) {
  console.error("ERROR: APP_ID is not set. Pass it via env: APP_ID=<id> npm run disable");
  process.exit(1);
}

async function disableContract(): Promise<void> {
  const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  const deployer = algosdk.mnemonicToSecretKey(DEPLOYER_MNEMONIC);
  const signer = algosdk.makeBasicAccountTransactionSigner(deployer);

  console.log(`Deployer address : ${deployer.addr}`);
  console.log(`App ID           : ${APP_ID}`);

  const arc32 = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "artifacts", "ProofVote.arc32.json"), "utf-8")
  ) as { contract: object };
  const contract = new algosdk.ABIContract(arc32.contract as algosdk.ABIContractParams);

  const suggestedParams = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: APP_ID,
    method: contract.getMethodByName("disable"),
    methodArgs: [],
    sender: deployer.addr,
    signer,
    suggestedParams,
  });

  console.log("Calling disable...");
  const result = await atc.execute(algod, 4);
  console.log(`✅ Contract disabled. Txn: ${result.txIDs[0]}`);
}

disableContract().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
