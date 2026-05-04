import algosdk from "algosdk";
import {
  VOTE_BOX_NAME_SIZE,
  USER_BOX_NAME_SIZE,
  VOTE_BOX_PREFIX,
  USER_BOX_PREFIX,
  UINT64_SIZE,
  VOTE_CREATOR_OFFSET,
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

// ─── Box name helpers ─────────────────────────────────────────────────────────
// Mirror of web/lib/algorand/boxes.ts — keep in sync when ABI layout changes.

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
export function generateUserVoteBoxName(voteId: number, address: string | algosdk.Address): Uint8Array {
  // Create a buffer of the correct size
  const buf = Buffer.alloc(USER_BOX_NAME_SIZE);
  
  // Write the prefix into the buffer
  buf.writeUInt8(USER_BOX_PREFIX, 0);
  
  // Write the voteId as an 8-byte big-endian unsigned integer starting at offset 1
  buf.writeBigUInt64BE(BigInt(voteId), 1);
  
  // Decode the Algorand address to get the public key
  const decoded = algosdk.decodeAddress(address.toString());

  // offset = prefix(1) + voteId(8)
  buf.set(decoded.publicKey, 1 + 8);
  
  return new Uint8Array(buf);
}

// ─── State decoding ───────────────────────────────────────────────────────────
// Mirror of web/lib/algorand/decoders.ts — keep in sync when ABI layout changes.

export interface DecodedVoteState {
  creator: string; // Algorand address
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
 * who created it, when it runs, how much stake, and result counts for each option.
 *
 * Layout (byte offsets) — see contracts/src/constants.ts:
 */
export function decodeVoteState(bytes: Uint8Array): DecodedVoteState {
  // Convert the input bytes to a Buffer for easier parsing
  const buf = Buffer.from(bytes);

  // Extract the creator's public key from the first 32 bytes and encode it as an Algorand address
  const creator = algosdk.encodeAddress(buf.subarray(VOTE_CREATOR_OFFSET, VOTE_CREATOR_OFFSET + 32));
  
  // Extract the next fields based on their byte offsets
  const endAt = buf.readBigUInt64BE(VOTE_END_AT_OFFSET);
  const stake = buf.readBigUInt64BE(VOTE_STAKE_OFFSET);
  const withdrawDeadline = buf.readBigUInt64BE(VOTE_WITHDRAW_DEADLINE_OFFSET);
  const optionCount = buf.readBigUInt64BE(VOTE_OPTION_COUNT_OFFSET);

  // Extract the vote counts for each option
  const counts: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    counts.push(buf.readBigUInt64BE(VOTE_COUNTS_OFFSET + i * UINT64_SIZE));
  }

  return { creator, endAt, stake, withdrawDeadline, optionCount, counts };
}

/**
 * Parses USER_VOTE_STATE_SIZE raw bytes from a box and returns the user's vote state.
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

// ─── Fetchers ───────────────────────────────────────────────────────────
// Mirror of web/lib/algorand/fetchers.ts — keep in sync when error handling or ABI layout changes.


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
  address: string | algosdk.Address
): Promise<DecodedUserVoteState | null> {
  try {
    // Compute the box name for this vote ID and fetch it from the network
    const boxName = generateUserVoteBoxName(voteId, address);
    const boxResponse = await algod.getApplicationBoxByName(appId, boxName).do();

    return decodeUserVoteState(boxResponse.value);
  } catch (err: unknown) {
    // Box not found is expected (user has not voted yet)
    if (isNotFoundError(err)) return null;
    throw err;
  }
}