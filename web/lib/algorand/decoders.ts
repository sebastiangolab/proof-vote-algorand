/**
 * The main purpose of these decoders is to convert the byte arrays returned by the Algorand node's box API
 * into structured TypeScript types that the frontend can work with
 * 
 * These functions implement the decoding logic based on the ARC-4 / ABI layouts defined in the smart contract.
 */

import algosdk from "algosdk";
import type { VoteState, UserVoteState } from "./types";
import {
  VOTE_STATE_SIZE,
  VOTE_CREATOR_OFFSET,
  VOTE_END_AT_OFFSET,
  VOTE_STAKE_OFFSET,
  VOTE_WITHDRAW_DEADLINE_OFFSET,
  VOTE_OPTION_COUNT_OFFSET,
  VOTE_COUNTS_OFFSET,
  UINT64_SIZE,
  USER_VOTE_STATE_SIZE,
  USER_VOTE_BOOL_BYTE,
  USER_VOTE_VOTED_BIT,
  USER_VOTE_WITHDRAWN_BIT,
  USER_VOTE_CHOICE_OFFSET,
  USER_VOTE_STAKE_LOCKED_OFFSET,
} from "./constants";

/**
 * Decodes raw box bytes into a VoteState struct.
 * Layout: see VOTE_* offset constants and VOTE_STATE_SIZE in ./constants.ts
 *
 * @param bytes - Raw bytes from algod box API
 * @returns Decoded VoteState
 */
export function decodeVoteState(bytes: Uint8Array): VoteState {
  if (bytes.length !== VOTE_STATE_SIZE) {
    throw new Error(`Expected ${VOTE_STATE_SIZE} bytes for VoteState, got ${bytes.length}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset);

  const creator = algosdk.encodeAddress(bytes.slice(VOTE_CREATOR_OFFSET, VOTE_CREATOR_OFFSET + 32));
  const endAt = view.getBigUint64(VOTE_END_AT_OFFSET);
  const stake = view.getBigUint64(VOTE_STAKE_OFFSET);
  const withdrawDeadline = view.getBigUint64(VOTE_WITHDRAW_DEADLINE_OFFSET);
  const optionCount = view.getBigUint64(VOTE_OPTION_COUNT_OFFSET);

  const counts: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    counts.push(view.getBigUint64(VOTE_COUNTS_OFFSET + i * UINT64_SIZE));
  }

  return { creator, endAt, stake, withdrawDeadline, optionCount, counts };
}

/**
 * Decodes raw box bytes into a UserVoteState struct.
 * Layout: see USER_VOTE_* constants and USER_VOTE_STATE_SIZE in ./constants.ts
 *
 * @param bytes - Raw bytes from algod box API
 * @returns Decoded UserVoteState
 */
export function decodeUserVoteState(bytes: Uint8Array): UserVoteState {
  if (bytes.length !== USER_VOTE_STATE_SIZE) {
    throw new Error(`Expected ${USER_VOTE_STATE_SIZE} bytes for UserVoteState, got ${bytes.length}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset);

  const boolByte = bytes[USER_VOTE_BOOL_BYTE];
  const voted = (boolByte & USER_VOTE_VOTED_BIT) !== 0;
  const withdrawn = (boolByte & USER_VOTE_WITHDRAWN_BIT) !== 0;
  const choice = view.getBigUint64(USER_VOTE_CHOICE_OFFSET);
  const stakeLocked = view.getBigUint64(USER_VOTE_STAKE_LOCKED_OFFSET);

  return { voted, choice, stakeLocked, withdrawn };
}
