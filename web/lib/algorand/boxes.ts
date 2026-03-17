/** 
 * Utility functions for constructing and parsing box names used in the application.
 * Box names are byte arrays that follow specific layouts to store states.
 */

import algosdk from "algosdk";
import {
  VOTE_BOX_NAME_SIZE,
  USER_BOX_NAME_SIZE,
  VOTE_BOX_PREFIX,
  USER_BOX_PREFIX,
} from "./constants";

/**
 * Builds the box name for a vote's state.
 * Layout: VOTE_BOX_PREFIX (1B) + voteId uint64 BE (UINT64_SIZE B) = VOTE_BOX_NAME_SIZE bytes
 *
 * @param voteId - Vote ID returned by the contract (bigint)
 * @returns Byte array suitable for BoxReference key
 */
export function generateVoteBoxName(voteId: bigint): Uint8Array {
  const buf = new Uint8Array(VOTE_BOX_NAME_SIZE);
  buf[0] = VOTE_BOX_PREFIX;
  const view = new DataView(buf.buffer);
  view.setBigUint64(1, voteId);
  return buf;
}

/**
 * Builds the box name for a user's vote state.
 * Layout: USER_BOX_PREFIX (1B) + voteId uint64 BE (UINT64_SIZE B) + pubkey (ADDRESS_SIZE B) = USER_BOX_NAME_SIZE bytes
 *
 * @param voteId - Vote ID (bigint)
 * @param address - Voter's Algorand address (58-char base32)
 * @returns Byte array suitable for BoxReference key
 */
export function generateUserVoteBoxName(voteId: bigint, address: string): Uint8Array {
  const buf = new Uint8Array(USER_BOX_NAME_SIZE);
  buf[0] = USER_BOX_PREFIX;
  const view = new DataView(buf.buffer);
  view.setBigUint64(1, voteId);
  const { publicKey } = algosdk.decodeAddress(address);
  // offset = prefix(1) + voteId(8)
  buf.set(publicKey, 1 + 8); 

  return buf;
}

/**
 * Parses a user box name (41 bytes) into { voteId, address }.
 * Returns null if the byte sequence doesn't match the user box format.
 */
export function parseUserVoteBoxName(name: Uint8Array): { voteId: bigint; address: string } | null {
  if (name.length !== USER_BOX_NAME_SIZE || name[0] !== USER_BOX_PREFIX) return null;

  const view = new DataView(name.buffer, name.byteOffset);
  const voteId = view.getBigUint64(1);
  // prefix(1) + voteId(8) to end is the public key
  const pubKey = name.slice(1 + 8, USER_BOX_NAME_SIZE);
  const address = algosdk.encodeAddress(pubKey);

  return { voteId, address };
}
