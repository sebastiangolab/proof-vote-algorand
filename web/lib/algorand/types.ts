/**
 * State of a single poll, decoded from a "v" box.
 * Mirror the on-chain VoteState struct defined in ARC-4.
 */
export type VoteState = {
  creator: string; // Algorand address
  startAt: bigint; // Unix timestamp seconds
  endAt: bigint; // Unix timestamp seconds
  stake: bigint; // microALGO required to vote
  withdrawDeadline: bigint; // Unix timestamp seconds
  optionCount: bigint; // 1-8
  counts: bigint[]; // 8-element array, votes per option
};

/**
 * State of a user's vote, decoded from a "u" box.
 * Mirror the on-chain UserVoteState struct defined in ARC-4.
 */
export type UserVoteState = {
  voted: boolean; // true if the user has voted
  choice: bigint; // 0-indexed option
  stakeLocked: bigint; // microALGO locked at vote time
  withdrawn: boolean; // true if the user has withdrawn their stake after vote ended
};

/**
 * Platform-level configuration read from the contract's global state.
 * Fetch at runtime with fetchAppConfig() instead of hardcoding in configs.ts.
 */
export type AppConfig = {
  platformOwner: string;         // Algorand address of the platform operator
  defaultStake: bigint;          // µALGO suggested stake shown in UI
  minStake: bigint;              // µALGO minimum enforced by contract
  maxStake: bigint;              // µALGO maximum enforced by contract
  defaultWithdrawWindow: bigint; // seconds — suggested window shown in UI
};

/**
 * Type of vote where the connected user can still withdraw their stake.
 */
export type WithdrawTarget = {
  voteId: bigint;
  stake: bigint;
  withdrawDeadline: bigint;
};

/**
 * Type of vote where the connected user has unclaimed stake that can be swept by the platform.
 */
export type SweepTarget = {
  voteId: bigint;
  userAddress: string;
  stake: bigint;
};
