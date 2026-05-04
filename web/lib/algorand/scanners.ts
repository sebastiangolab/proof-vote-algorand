/**
 * Scanners are functions that fetch all application boxes,
 * filter them according to given criteria, and return the filtered list.
 */

import type { WithdrawTarget, SweepTarget, VoteState } from "./types";
import { USER_VOTE_BOX_MBR } from "./constants";
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
    return [{ voteId: 2n, stake: 1_000_000n + USER_VOTE_BOX_MBR, withdrawDeadline: now + 7n * 86400n }];
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

  // Fetch all vote states in parallel, then filter to ended votes within the window
  const voteStates = await Promise.all(voteIds.map((voteId) => fetchVoteState(voteId)));

  // Filter to voteIds where voting has ended but withdraw deadline has not passed
  const eligibleVoteIds = voteIds.filter((voteId, i) => {
    const voteState = voteStates[i];

    if (!voteState) return false; // vote state missing, skip
    if (voteState.endAt >= now) return false;       // voting not yet ended
    if (voteState.withdrawDeadline < now) return false; // window already closed

    return true;
  });

  // For eligible votes, fetch user states in parallel
  const userStates = await Promise.all(
    eligibleVoteIds.map((voteId) => fetchUserVoteState(voteId, address))
  );

  const targets: WithdrawTarget[] = [];
  for (let i = 0; i < eligibleVoteIds.length; i++) {
    const voteId = eligibleVoteIds[i];
    const voteState = voteStates[voteIds.indexOf(voteId)]!;
    const userState = userStates[i];

    if (!userState || !userState.voted || userState.withdrawn) continue;

    targets.push({
      voteId,
      stake: userState.stakeLocked + USER_VOTE_BOX_MBR,
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

  const boxesResult = await algod.getApplicationBoxes(appId).do();

  // Parse all user vote box names upfront, skip 'v' vote boxes
  const userBoxes = boxesResult.boxes
    .map((box) => parseUserVoteBoxName(new Uint8Array(box.name)))
    .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null);

  // Fetch all unique vote states in parallel
  const uniqueVoteIds = [...new Set(userBoxes.map((b) => b.voteId))];

  // Fetch all vote states in parallel and cache them in a Map for quick lookup
  const voteStateResults = await Promise.all(
    uniqueVoteIds.map((voteId) => fetchVoteState(voteId))
  );

  // Create a Map of voteId to VoteState (or null if not found) for quick access
  const voteCache = new Map<bigint, VoteState | null>(
    uniqueVoteIds.map((voteId, i) => [voteId, voteStateResults[i]])
  );

  // Filter to user boxes where the vote's withdrawal deadline has passed
  const eligibleBoxes = userBoxes.filter(({ voteId }) => {
    const voteState = voteCache.get(voteId);
    return voteState != null && voteState.withdrawDeadline < now;
  });

  // Fetch all eligible user box values in parallel
  const userBoxValues = await Promise.all(
    eligibleBoxes.map(({ voteId, address }) =>
      algod
        .getApplicationBoxByName(appId, generateUserVoteBoxName(voteId, address))
        .do()
        .catch(() => null)
    )
  );

  // Decode and filter to voted=true, withdrawn=false
  const targets: SweepTarget[] = [];
  for (let i = 0; i < eligibleBoxes.length; i++) {
    const boxResult = userBoxValues[i];
    if (!boxResult) continue;

    const userState = decodeUserVoteState(new Uint8Array(boxResult.value));
    if (!userState.voted || userState.withdrawn) continue;

    const { voteId, address } = eligibleBoxes[i];
    targets.push({ voteId, userAddress: address, stake: userState.stakeLocked + USER_VOTE_BOX_MBR });
  }

  return targets;
}
