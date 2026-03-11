/**
 * LocalNet test helpers for ProofVote contract tests.
 *
 * Prerequisites:
 *   - AlgoKit CLI installed
 *   - `algokit localnet start` running (Docker required)
 *   - `npm run build` executed to generate artifacts/
 */

import algosdk from "algosdk";
import path from "path";
import fs from "fs";
import {
  VOTE_BOX_NAME_SIZE,
  USER_BOX_NAME_SIZE,
  VOTE_BOX_PREFIX,
  USER_BOX_PREFIX,
  UINT64_SIZE,
  VOTE_CREATOR_OFFSET,
  VOTE_START_AT_OFFSET,
  VOTE_END_AT_OFFSET,
  VOTE_STAKE_OFFSET,
  VOTE_WITHDRAW_DEADLINE_OFFSET,
  VOTE_OPTION_COUNT_OFFSET,
  VOTE_COUNTS_OFFSET,
  USER_VOTE_BOOL_BYTE,
  USER_VOTE_VOTED_BIT,
  USER_VOTE_WITHDRAWN_BIT,
  USER_VOTE_CHOICE_OFFSET,
  USER_VOTE_STAKE_LOCKED_OFFSET,
} from "../../src/constants";

// ─── LocalNet connection ──────────────────────────────────────────────────────

/** AlgoKit LocalNet default algod connection details */
const LOCALNET_HOST = "http://localhost";
const LOCALNET_PORT = 4001;
// AlgoKit LocalNet uses a fixed 64-char token
const LOCALNET_TOKEN = "a".repeat(64);

/**
 * Creates and returns an algod client connected to the local network.
 * Takes no arguments — returns a ready-to-use object for blockchain communication.
 */
export function getLocalnetClient(): algosdk.Algodv2 {
  return new algosdk.Algodv2(LOCALNET_TOKEN, LOCALNET_HOST, LOCALNET_PORT);
}

// ─── Account helpers ──────────────────────────────────────────────────────────

/**
 * Sends ALGO from the dispenser account to a given address.
 * The dispenser is a LocalNet-only account pre-loaded with large ALGO balance,
 * used exclusively to fund test accounts during development.
 * Creates a payment transaction, signs it, and waits for block confirmation.
 *
 * @param algod      - Algod client (LocalNet)
 * @param dispenser  - Dispenser account to send from
 * @param address    - Recipient Algorand address
 * @param amount     - Amount in µALGO
 */
export async function fundAccount(
  algod: algosdk.Algodv2,
  dispenser: algosdk.Account,
  address: string,
  amount: number
): Promise<void> {
  // Get suggested params for the transaction
  const params = await algod.getTransactionParams().do();

  // Create a payment transaction from the dispenser to the target address
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: dispenser.addr,
    to: address,
    amount,
    suggestedParams: params,
  });

  // Sign and send the transaction
  const signed = txn.signTxn(dispenser.sk);
  const { txId } = await algod.sendRawTransaction(signed).do();

  // Wait for confirmation
  await algosdk.waitForConfirmation(algod, txId, 4);
}

/**
 * Fetches the dispenser account from the local KMD wallet.
 *
 * KMD (Key Management Daemon) is a separate service running alongside LocalNet (port 4002).
 * It acts as a secure vault for private keys, storing accounts in encrypted wallets
 * and exposing them via API. AlgoKit LocalNet starts with a ready-made wallet
 * called `unencrypted-default-wallet` which holds the dispenser account.
 *
 * The dispenser is a special LocalNet account pre-loaded with a large amount of ALGO.
 * It exists only for local development — its sole purpose is to fund test accounts.
 *
 * This function connects to KMD, opens that wallet, exports the dispenser's private key,
 * and returns it as a regular Account object that can be used to sign transactions.
 */
export async function getDispenser(algod: algosdk.Algodv2): Promise<algosdk.Account> {
  // AlgoKit LocalNet KMD default wallet
  const kmd = new algosdk.Kmd("a".repeat(64), "http://localhost", 4002);

  // List wallets and find the default one
  const wallets = await kmd.listWallets();
  const defaultWallet = (wallets.wallets as Array<{ name: string; id: string }>).find(
    (w) => w.name === "unencrypted-default-wallet"
  );

  if (!defaultWallet) throw new Error("LocalNet default wallet not found");

  // Get a handle to the wallet and list its keys (addresses)
  const { wallet_handle_token: handle } = await kmd.initWalletHandle(defaultWallet.id, "");
  const { addresses } = await kmd.listKeys(handle);
  const dispenserAddr = (addresses as string[])[0];

  // Export the private key for the dispenser
  const { private_key: sk } = await kmd.exportKey(handle, "", dispenserAddr);
  await kmd.releaseWalletHandle(handle);

  return {
    addr: dispenserAddr,
    sk: new Uint8Array(sk as unknown as Uint8Array),
  };
}

/**
 * Generates n new test accounts and funds each of them.
 * Returns an array of ready-to-use accounts with ALGO balance (default 10 ALGO each).
 *
 * @param algod      - Algod client (LocalNet)
 * @param dispenser  - Dispenser account to fund from
 * @param n          - Number of accounts to create
 * @param fundAmount - µALGO per account (default 10 ALGO)
 * @returns Array of funded algosdk.Account objects
 */
export async function createTestAccounts(
  algod: algosdk.Algodv2,
  dispenser: algosdk.Account,
  n: number,
  fundAmount = 10_000_000
): Promise<algosdk.Account[]> {
  const accounts: algosdk.Account[] = [];

  // Generate n accounts and fund each from the dispenser
  for (let i = 0; i < n; i++) {
    const account = algosdk.generateAccount();
    await fundAccount(algod, dispenser, account.addr, fundAmount);
    accounts.push(account);
  }

  return accounts;
}

// ─── Contract deployment ──────────────────────────────────────────────────────

const ARTIFACTS_DIR = path.join(__dirname, "..", "..", "artifacts");

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
    defaultStake = 1_000_000, // 1 ALGO
    minStake = 500_000, // 0.5 ALGO
    maxStake = 10_000_000, // 10 ALGO
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
  const appId = confirmation["application-index"] as number;
  const appAddress = algosdk.getApplicationAddress(appId);

  // Return the appId and appAddress for use in tests
  return { appId, appAddress };
}

// ─── ABI helpers ──────────────────────────────────────────────────────────────

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

// ─── Box name helpers ─────────────────────────────────────────────────────────

/**
 * Computes the box name for a given vote.
 * Returns 9 bytes: the letter 'v' + voteId encoded as an 8-byte big-endian number.
 *
 * @param voteId - Vote ID (number)
 */
export function generateVoteBoxName(voteId: number): Uint8Array {
  // Create a buffer of the correct size
  const buf = Buffer.alloc(VOTE_BOX_NAME_SIZE);

  // Write the prefix into the buffer 
  buf.writeUInt8(VOTE_BOX_PREFIX, 0);

  // Write the voteId as an 8-byte big-endian unsigned integer starting at offset 1
  buf.writeBigUInt64BE(BigInt(voteId), 1);
  return new Uint8Array(buf);
}

/**
 * Computes the box name for a specific user's vote.
 * Returns 41 bytes: the letter 'u' + voteId (8B) + user's public key (32B).
 *
 * @param voteId  - Vote ID (number)
 * @param address - Voter's Algorand address (58-char base32)
 */
export function generateUserVoteBoxName(voteId: number, address: string): Uint8Array {
  // Create a buffer of the correct size
  const buf = Buffer.alloc(USER_BOX_NAME_SIZE);
  
  // Write the prefix into the buffer
  buf.writeUInt8(USER_BOX_PREFIX, 0);
  
  // Write the voteId as an 8-byte big-endian unsigned integer starting at offset 1
  buf.writeBigUInt64BE(BigInt(voteId), 1);
  
  // Decode the Algorand address to get the public key
  const decoded = algosdk.decodeAddress(address);

  // offset = prefix(1) + voteId(8)
  buf.set(decoded.publicKey, 1 + 8);
  
  return new Uint8Array(buf);
}

// ─── State decoding ───────────────────────────────────────────────────────────

export interface DecodedVoteState {
  creator: string; // Algorand address
  startAt: bigint; // Unix timestamp in seconds
  endAt: bigint; // Unix timestamp in seconds
  stake: bigint;  // Total stake in µALGO
  withdrawDeadline: bigint; // Unix timestamp in seconds when users can withdraw their stake after voting ends
  optionCount: bigint; // Number of voting options
  counts: bigint[]; // Array of vote counts for each option
}

export interface DecodedUserVoteState {
  voted: boolean; // Whether the user has voted (true if they have a vote box)
  choice: bigint; // The option the user chose
  stakeLocked: bigint; // Amount of stake locked in µALGO
  withdrawn: boolean; // Whether the user has withdrawn their stake
}

/**
 * Parses VOTE_STATE_SIZE raw bytes from a box and returns a readable vote state object:
 * who created it, when it runs, how much stake, and result counts for each option (8 counters).
 *
 * Layout (byte offsets) — see contracts/src/constants.ts:
 */
export function decodeVoteState(bytes: Uint8Array): DecodedVoteState {
  // Convert the input bytes to a Buffer for easier parsing
  const buf = Buffer.from(bytes);

  // Extract the creator's public key from the first 32 bytes and encode it as an Algorand address
  const creator = algosdk.encodeAddress(buf.subarray(VOTE_CREATOR_OFFSET, VOTE_CREATOR_OFFSET + 32));
  
  // Extract the next fields based on their byte offsets
  const startAt = buf.readBigUInt64BE(VOTE_START_AT_OFFSET);
  const endAt = buf.readBigUInt64BE(VOTE_END_AT_OFFSET);
  const stake = buf.readBigUInt64BE(VOTE_STAKE_OFFSET);
  const withdrawDeadline = buf.readBigUInt64BE(VOTE_WITHDRAW_DEADLINE_OFFSET);
  const optionCount = buf.readBigUInt64BE(VOTE_OPTION_COUNT_OFFSET);

  // Extract the vote counts for each option
  const counts: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    counts.push(buf.readBigUInt64BE(VOTE_COUNTS_OFFSET + i * UINT64_SIZE));
  }

  return { creator, startAt, endAt, stake, withdrawDeadline, optionCount, counts };
}

/**
 * Parses USER_VOTE_STATE_SIZE (17) raw bytes from a box and returns the user's vote state.
 *
 * Layout (byte offsets) — see contracts/src/constants.ts:
 */
export function decodeUserVoteState(bytes: Uint8Array): DecodedUserVoteState {
  // Convert the input bytes to a Buffer for easier parsing
  const buf = Buffer.from(bytes);

  // Extract fields based on their byte offsets
  const boolByte = buf.readUInt8(USER_VOTE_BOOL_BYTE);
  const voted = (boolByte & USER_VOTE_VOTED_BIT) !== 0;
  const withdrawn = (boolByte & USER_VOTE_WITHDRAWN_BIT) !== 0;
  const choice = buf.readBigUInt64BE(USER_VOTE_CHOICE_OFFSET);
  const stakeLocked = buf.readBigUInt64BE(USER_VOTE_STAKE_LOCKED_OFFSET);

  return { voted, choice, stakeLocked, withdrawn };
}

/**
 * Fetches a vote box from the network and decodes it into a DecodedVoteState object.
 * Returns null if the box does not exist (vote was never created).
 */
export async function fetchVoteState(
  algod: algosdk.Algodv2,
  appId: number,
  voteId: number
): Promise<DecodedVoteState | null> {
  try {
    // Compute the box name for this vote ID and fetch it from the network
    const boxName = generateVoteBoxName(voteId);
    const boxResponse = await algod.getApplicationBoxByName(appId, boxName).do();

    return decodeVoteState(boxResponse.value);
  } catch (err: unknown) {
    // Box not found is expected (poll was never created / was deleted)
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

/**
 * Fetches a user's vote box from the network and decodes it into a DecodedUserVoteState object.
 * Returns null if the box does not exist (user has not interacted with this vote yet).
 */
export async function fetchUserVoteState(
  algod: algosdk.Algodv2,
  appId: number,
  voteId: number,
  address: string
): Promise<DecodedUserVoteState | null> {
  try {
    // Compute the box name for this vote ID and fetch it from the network
    const boxName = generateUserVoteBoxName(voteId, address);
    const boxResponse = await algod.getApplicationBoxByName(appId, boxName).do();

    return decodeUserVoteState(boxResponse.value);
  } catch (err: unknown) {
    // Box not found is expected (user hasn't voted / box was deleted)
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

/** Returns true if the error represents a 404 Not Found from the algod API. */
function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    // algosdk v3 wraps HTTP errors; status is on the error object
    const httpErr = err as Error & { status?: number; response?: { status?: number } };
    const status = httpErr.status ?? httpErr.response?.status;
    return status === 404;
  }
  return false;
}
