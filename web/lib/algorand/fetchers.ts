/**
 * Fetcher functions to get and decode states from Algorand boxes.
 * 
 * These functions interact with the Algorand node's box API to get the raw byte data,
 * then use decoders to convert it into structured types for the frontend.
 *
 * When NEXT_PUBLIC_APP_ID=0, these functions return mock data for local UI development 
 * without needing a live blockchain connection.
 */

import algosdk from "algosdk";
import type { VoteState, UserVoteState, AppConfig } from "./types";
import { getAlgodClient } from "./client";
import { generateVoteBoxName, generateUserVoteBoxName } from "./boxes";
import { decodeVoteState, decodeUserVoteState } from "./decoders";

// ─── Mock Data (when APP_ID = 0) ───────────────────────────────────────────────────

export const MOCK_OWNER = "MDV4NQNW6QMNU3KKQYQVT4K4LEKINMXVCNQDFLIGGIQYS6ISY4YVLDPLAY";

// Returns mock VoteState for given voteId, or null if not defined
function getMockVoteState(voteId: bigint): VoteState | null {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const mocks: Record<string, VoteState> = {
    "1": {
      creator: MOCK_OWNER,
      startAt: now - 86400n,
      endAt: now + 7n * 86400n,
      stake: 1_000_000n,
      withdrawDeadline: now + 14n * 86400n,
      optionCount: 3n,
      counts: [12n, 7n, 3n, 0n, 0n, 0n, 0n, 0n],
    },
    "2": {
      creator: MOCK_OWNER,
      startAt: now - 30n * 86400n,
      endAt: now - 7n * 86400n,
      stake: 1_000_000n,
      withdrawDeadline: now + 7n * 86400n,
      optionCount: 4n,
      counts: [45n, 23n, 18n, 9n, 0n, 0n, 0n, 0n],
    },
  };

  return mocks[voteId.toString()] ?? null;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Fetches platform configuration from the contract's global state.
 * Returns defaultStake, minStake, maxStake and defaultWithdrawWindow.
 * Falls back to hardcoded values from configs.ts when APP_ID is not set.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const appId = process.env.NEXT_PUBLIC_APP_ID;

  if (!appId) {
    throw new Error("NEXT_PUBLIC_APP_ID is not set. Cannot fetch app config.");
  }

  if (appId === "0") {
    // Fallback matching deploy.ts initial values
    return {
      platformOwner:        MOCK_OWNER,
      defaultStake:         1_000_000n,
      minStake:             500_000n,
      maxStake:             10_000_000n,
      defaultWithdrawWindow: 7n * 24n * 3600n,
    };
  }

  const algod = getAlgodClient();
  const appInfo = await algod.getApplicationByID(Number(appId)).do();
  const gs = appInfo.params.globalState ?? [];

  function findEntry(keyName: string) {
    const keyBytes = new TextEncoder().encode(keyName);
    return gs.find((e) => {
      const k = e.key;
      return k.length === keyBytes.length && keyBytes.every((b, i) => k[i] === b);
    });
  }

  function getUint(keyName: string): bigint {
    return findEntry(keyName)?.value?.uint ?? 0n;
  }

  function getPlatformOwnerAddress(): string {
    const bytes = findEntry("platformOwner")?.value?.bytes;
    return bytes?.length === 32 ? algosdk.encodeAddress(bytes) : "";
  }

  return {
    platformOwner:         getPlatformOwnerAddress(),
    defaultStake:          getUint("defaultStake"),
    minStake:              getUint("minStake"),
    maxStake:              getUint("maxStake"),
    defaultWithdrawWindow: getUint("defaultWithdrawWindow"),
  };
}

/**
 * Fetches and decodes the VoteState from the Algorand box.
 * 
 * @param voteId - Vote ID (bigint)
 * @returns Decoded VoteState, or null if the box does not exist
 */
export async function fetchVoteState(voteId: bigint): Promise<VoteState | null> {
  const appId = process.env.NEXT_PUBLIC_APP_ID;

  if (!appId) {
    throw new Error("NEXT_PUBLIC_APP_ID is not set. Cannot fetch vote state.");
  }

  // If no real app ID is set, return mock data for local development
  if (appId === "0") return getMockVoteState(voteId);

  // Get the Algod client and box name for the vote
  const algod = getAlgodClient();
  const boxName = generateVoteBoxName(voteId);

  try {
    // Fetch the box value from Algorand and decode it into VoteState
    const result = await algod.getApplicationBoxByName(Number(appId), boxName).do();
    return decodeVoteState(new Uint8Array(result.value));
  } catch {
    // algod returns 404 when box doesn't exist
    return null;
  }
}

/**
 * Fetches and decodes the UserVoteState from the Algorand box.
 * 
 * @param voteId - Vote ID (bigint)
 * @param address - Voter Algorand address (58 chars)
 * @returns Decoded UserVoteState, or null if the user hasn't voted
 */
export async function fetchUserVoteState(voteId: bigint, address: string): Promise<UserVoteState | null> {
  const appId = process.env.NEXT_PUBLIC_APP_ID;

  if (!appId) {
    throw new Error("NEXT_PUBLIC_APP_ID is not set. Cannot fetch user state.");
  }

  // If no real app ID is set, return null (no user state) for local development
  if (appId === "0") return null;

  // Get the Algod client and box name for the user's vote
  const algod = getAlgodClient();
  const boxName = generateUserVoteBoxName(voteId, address);

  try {
    // Fetch the box value from Algorand and decode it into UserVoteState
    const result = await algod.getApplicationBoxByName(Number(appId), boxName).do();
    return decodeUserVoteState(new Uint8Array(result.value));
  } catch {
    return null;
  }
}
