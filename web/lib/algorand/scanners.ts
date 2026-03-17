/**
 * Scanners are functions that fetch all application boxes,
 * filter them according to given criteria, and return the filtered list.
 */

import type { WithdrawTarget, SweepTarget, VoteState } from "./types";
import { getAlgodClient } from "./client";
import { generateUserVoteBoxName, parseUserVoteBoxName } from "./boxes";
import { decodeUserVoteState } from "./decoders";
import { fetchVoteState, fetchUserVoteState, MOCK_OWNER } from "./fetchers";

/**
 * Finds all votes where the given address has an unclaimed, withdrawable stake.
 * Scans all vote boxes to get voteIds, then checks each user box.
 * In mock mode returns one target for voteId=2 (ended, within deadline).
 */
export async function findUserWithdrawable(address: string): Promise<WithdrawTarget[]> {
  const appIdStr = process.env.NEXT_PUBLIC_APP_ID;
  const now = BigInt(Math.floor(Date.now() / 1000));

  if (!appIdStr) {
    throw new Error("NEXT_PUBLIC_APP_ID is not set");
  }

  // In mock mode, return a single target for local development
  if (appIdStr === "0") {
    return [{ voteId: 2n, stake: 1_000_000n, withdrawDeadline: now + 7n * 86400n }];
  }

  const appId = Number(appIdStr);
  const algod = getAlgodClient();

  // Fetch all boxes for the app
  const boxesResult = await algod.getApplicationBoxes(appId).do();

  // Extract voteIds from box names that match the "v" layout (9 bytes, starts with 0x76).
  const voteIds: bigint[] = [];
  for (const box of boxesResult.boxes) {
    const name = new Uint8Array(box.name);
    
    if (name.length === 9 && name[0] === 0x76) {
      const view = new DataView(name.buffer, name.byteOffset);
      voteIds.push(view.getBigUint64(1));
    }
  }

  // For each voteId, check if the user has a withdrawable stake
  const targets: WithdrawTarget[] = [];
  for (const voteId of voteIds) {
    // Fetch the VoteState for this voteId
    const voteState = await fetchVoteState(voteId);

    // If the vote doesn't exist, skip
    if (!voteState) continue;

    // If the vote hasn't ended yet, skip
    if (voteState.endAt >= now) continue;

    // If the withdraw deadline has passed, skip
    if (voteState.withdrawDeadline < now) continue; 

    // Fetch the user's vote state for this voteId
    const userState = await fetchUserVoteState(voteId, address);

    // If the user hasn't voted, or has already withdrawn, skip
    if (!userState || !userState.voted || userState.withdrawn) continue;

    targets.push({
      voteId,
      stake: userState.stakeLocked,
      withdrawDeadline: voteState.withdrawDeadline,
    });
  }

  return targets;
}

/**
 * Scans all app boxes and returns users whose stake is eligible to be swept:
 *   - voted = true
 *   - withdrawn = false
 *   - vote's withdrawDeadline has passed
 *
 * When NEXT_PUBLIC_APP_ID=0, returns a single mock target for local development.
 */
export async function findEligibleSweeps(): Promise<SweepTarget[]> {
  const appIdStr = process.env.NEXT_PUBLIC_APP_ID;

  if (!appIdStr) {
    throw new Error("NEXT_PUBLIC_APP_ID is not set");
  }

  // In mock mode, return a single target for local development
  if (appIdStr === "0") {
    return [{ voteId: 2n, userAddress: MOCK_OWNER, stake: 1_000_000n }];
  }

  const appId = Number(appIdStr);
  const algod = getAlgodClient();
  const now = BigInt(Math.floor(Date.now() / 1000));

  // Cache of VoteState per voteId to avoid redundant fetches
  const voteCache = new Map<bigint, VoteState | null>();

  const boxesResult = await algod.getApplicationBoxes(appId).do();
  const targets: SweepTarget[] = [];

  // Iterate over all boxes, looking for user vote boxes (those that can be parsed by parseUserVoteBoxName)
  // For each user vote box, check if the vote ended and the withdraw deadline passed
  // then check if the user's stake is eligible to be swept
  for (const box of boxesResult.boxes) {
    const parsed = parseUserVoteBoxName(new Uint8Array(box.name));

    if (!parsed) continue; // skip 'v' vote boxes

    const { voteId, address } = parsed;

    // Fetch and cache the VoteState for this voteId
    if (!voteCache.has(voteId)) {
      const vs = await fetchVoteState(voteId);
      voteCache.set(voteId, vs);
    }

    // Get the cached VoteState
    const voteState = voteCache.get(voteId);

    // If the vote doesn't exist, skip
    if (!voteState) continue;

    // If the vote hasn't ended yet, or if the withdraw deadline hasn't passed, skip
    if (voteState.withdrawDeadline >= now) continue;

    // Fetch the user's vote state for this voteId
    const userBoxResult = await algod
      .getApplicationBoxByName(appId, generateUserVoteBoxName(voteId, address))
      .do()
      .catch(() => null);

    // If the user box doesn't exist, skip
    if (!userBoxResult) continue;

    // Decode the user vote state from the box value
    const userState = decodeUserVoteState(new Uint8Array(userBoxResult.value));

    // If the user hasn't voted, or has already withdrawn, skip
    if (!userState.voted || userState.withdrawn) continue;

    targets.push({ voteId, userAddress: address, stake: userState.stakeLocked });
  }

  return targets;
}
