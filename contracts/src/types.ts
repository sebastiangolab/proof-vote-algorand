// ─── ARC-4 Struct Types ───────────────────────────────────────────────────────
// Byte sizes and offsets are defined in constants.ts.

/**
 * On-chain state for a single voting poll.
 * See constants.ts for field offsets, byte sizes, and total size (VOTE_STATE_SIZE).
 */
export type VoteState = {
  creator: Address; // wallet that created this poll
  endAt: uint64; // unix timestamp: voting closes
  stake: uint64; // µALGO required per voter
  withdrawDeadline: uint64; // unix timestamp: last moment to self-withdraw
  optionCount: uint64; // number of vote options (2–8)
  counts: StaticArray<uint64, 8>; // vote tally per option (indices 0-7)
};

/**
 * Composite key for the userVotes BoxMap.
 * See constants.ts for box name layout and total size (USER_BOX_NAME_SIZE).
 */
export type UserVoteKey = {
  voteId: uint64; // poll ID
  user: Address; // voter's wallet address
};

/**
 * Per-user state for a single vote.
 * See constants.ts for field offsets, byte sizes, and total size (USER_VOTE_STATE_SIZE).
 */
export type UserVoteState = {
  voted: boolean; // ⎫ 1 byte total
  withdrawn: boolean; // ⎭ (ARC-4 packed)
  choice: uint64; // option index chosen (0-based)
  stakeLocked: uint64; // µALGO held for this user
};
