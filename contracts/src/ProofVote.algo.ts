import { Contract } from "@algorandfoundation/tealscript";
import { VoteState, UserVoteKey, UserVoteState } from "./types";
import { VOTE_BOX_MBR, USER_VOTE_BOX_MBR, VOTE_COUNTS_OFFSET, UINT64_SIZE } from "./constants";

// ─── Contract ─────────────────────────────────────────────────────────────────

class ProofVote extends Contract {
  // ── Global State (6 keys) ──────────────────────────────────────────────────

  /** Address of the platform operator; set to deployer on createApplication */
  platformOwner = GlobalStateKey<Address>();

  /** Default poll stake in µALGO; used by the UI as a suggested value */
  defaultStake = GlobalStateKey<uint64>();

  /** Minimum allowed stake for any poll in µALGO */
  minStake = GlobalStateKey<uint64>();

  /** Maximum allowed stake for any poll in µALGO */
  maxStake = GlobalStateKey<uint64>();

  /** Default withdrawal window in seconds; suggested value for createVote */
  defaultWithdrawWindow = GlobalStateKey<uint64>();

  /** Auto-incrementing poll ID counter; first poll gets ID 1 */
  nextVoteId = GlobalStateKey<uint64>();

  // ── Box Maps ───────────────────────────────────────────────────────────────

  /**
   * Poll storage: box name = VOTE_BOX_NAME_SIZE bytes, value = VOTE_STATE_SIZE bytes.
   * MBR per box = VOTE_BOX_MBR  (see constants.ts)
   */
  votes = BoxMap<uint64, VoteState>({ prefix: "v" });

  /**
   * Per-user vote storage: box name = USER_BOX_NAME_SIZE bytes, value = USER_VOTE_STATE_SIZE bytes.
   * MBR per box = USER_VOTE_BOX_MBR  (see constants.ts)
   */
  userVotes = BoxMap<UserVoteKey, UserVoteState>({ prefix: "u" });

  // ── Methods ────────────────────────────────────────────────────────────────

  /**
   * Deploy the contract and set initial stake parameters.
   * The deployer becomes the permanent platformOwner.
   *
   * @param defaultStake          - Default poll stake in µALGO (e.g. 1_000_000 = 1 ALGO)
   * @param minStake              - Minimum allowed stake in µALGO
   * @param maxStake              - Maximum allowed stake in µALGO
   * @param defaultWithdrawWindow - Default withdrawal window in seconds (e.g. 86400 = 1 day)
   */
  createApplication(
    defaultStake: uint64,
    minStake: uint64,
    maxStake: uint64,
    defaultWithdrawWindow: uint64
  ): void {
    this.platformOwner.value = this.txn.sender;
    this.defaultStake.value = defaultStake;
    this.minStake.value = minStake;
    this.maxStake.value = maxStake;
    this.defaultWithdrawWindow.value = defaultWithdrawWindow;
    // Vote IDs start at 1 so that 0 can serve as a sentinel "unset" value
    this.nextVoteId.value = 1;
  }

  /**
   * Create a new voting poll.
   *
   * The caller must include a PayTxn in the same atomic group that covers
   * the vote box MBR (see VOTE_BOX_MBR in constants.ts).
   *
   * @param startAt        - Unix timestamp when voting opens
   * @param endAt          - Unix timestamp when voting closes (must be > startAt)
   * @param optionCount    - Number of options (2–8 inclusive)
   * @param stake          - Required stake per voter in µALGO
   * @param withdrawWindow - Seconds after endAt during which users may self-withdraw
   * @param mbrPayment     - PayTxn to contract for VOTE_BOX_MBR
   * @returns              Assigned poll ID (uint64, auto-incremented from 1)
   */
  createVote(
    startAt: uint64,
    endAt: uint64,
    optionCount: uint64,
    stake: uint64,
    withdrawWindow: uint64,
    mbrPayment: PayTxn
  ): uint64 {
    assert(endAt > startAt, "endAt must be after startAt");
    assert(optionCount >= 2, "at least 2 options required");
    assert(optionCount <= 8, "at most 8 options allowed");
    assert(stake >= this.minStake.value, "stake below minimum");
    assert(stake <= this.maxStake.value, "stake above maximum");

    // Verify caller has paid the vote box MBR 
    // see VOTE_BOX_MBR in constants.ts
    verifyPayTxn(mbrPayment, {
      receiver: this.app.address,
      amount: VOTE_BOX_MBR,
    });

    // Assign the next available vote ID and increment the counter for the next poll.
    const voteId = this.nextVoteId.value;
    this.nextVoteId.value = voteId + 1;

    // Initialise all 8 vote counts to zero
    const counts: StaticArray<uint64, 8> = [0, 0, 0, 0, 0, 0, 0, 0];

    this.votes(voteId).value = {
      creator: this.txn.sender,
      startAt: startAt,
      endAt: endAt,
      stake: stake,
      // withdrawDeadline is computed from endAt + withdrawWindow
      withdrawDeadline: endAt + withdrawWindow,
      optionCount: optionCount,
      counts: counts,
    };

    return voteId;
  }

  /**
   * Cast a vote on an active poll.
   *
   * Must be submitted in an atomic group with a PayTxn BEFORE this AppCall:
   *   PayTxn amount = stake + USER_VOTE_BOX_MBR  (see constants.ts)
   *
   * The PayTxn argument references the preceding group transaction automatically
   * by the AVM framework — do not add a separate payment outside the ATC group.
   *
   * @param voteId  - Poll ID to vote on
   * @param choice  - Option index (0-based, must be < optionCount)
   * @param payment - PayTxn with amount = stake + USER_VOTE_BOX_MBR, receiver = contract address
   */
  vote(voteId: uint64, choice: uint64, payment: PayTxn): void {
    assert(this.votes(voteId).exists, "vote does not exist");

    const voteState = this.votes(voteId).value;

    assert(globals.latestTimestamp >= voteState.startAt, "voting not started");
    assert(globals.latestTimestamp < voteState.endAt, "voting ended");
    assert(choice < voteState.optionCount, "invalid choice index");

    // Verify the user has paid the required amount (stake + user box MBR)
    // See USER_VOTE_BOX_MBR in constants.ts
    const userVoteKey: UserVoteKey = { voteId: voteId, user: this.txn.sender };
    assert(!this.userVotes(userVoteKey).exists, "already voted");

    verifyPayTxn(payment, {
      receiver: this.app.address,
      amount: voteState.stake + USER_VOTE_BOX_MBR,
    });

    // Create the user's vote record
    this.userVotes(userVoteKey).value = {
      voted: true,
      withdrawn: false,
      choice: choice,
      stakeLocked: voteState.stake,
    };

    // Increment the vote count for the chosen option.
    // extract3 are used to read the current count for the chosen option
    // from the byte array stored in the box.
    const voteBytes = rawBytes(this.votes(voteId).value);
    const byteOffset = VOTE_COUNTS_OFFSET + choice * UINT64_SIZE;
    const currentCount = btoi(extract3(voteBytes, byteOffset, UINT64_SIZE));

    // Update the count in the byte array and write it back to the box.
    // castBytes<VoteState> is used to convert the modified byte array back to the VoteState struct.
    // replace3 is used to write the updated count back into the correct position in the byte array.
    this.votes(voteId).value = castBytes<VoteState>(
      replace3(voteBytes, byteOffset, itob(currentCount + 1))
    );
  }

  /**
   * Withdraw staked ALGO after a poll ends, within the withdrawal window.
   * Refunds stakeLocked + USER_VOTE_BOX_MBR to the caller (see constants.ts).
   * Deletes the user box to reclaim its MBR from the contract's minimum balance.
   *
   * @param voteId - Poll ID to withdraw from
   */
  withdraw(voteId: uint64): void {
    assert(this.votes(voteId).exists, "vote does not exist");

    const voteState = this.votes(voteId).value;
    assert(globals.latestTimestamp >= voteState.endAt, "voting not ended");
    assert(globals.latestTimestamp <= voteState.withdrawDeadline, "withdrawal window closed");

    const userVoteKey: UserVoteKey = { voteId: voteId, user: this.txn.sender };
    assert(this.userVotes(userVoteKey).exists, "no vote record found");

    const userVoteState = this.userVotes(userVoteKey).value;
    assert(userVoteState.voted, "did not vote");
    // Note: if withdrawn=true the box would have been deleted on first withdrawal,
    // so this check is defence-in-depth for any edge case.
    assert(!userVoteState.withdrawn, "already withdrawn");

    const stakeLocked = userVoteState.stakeLocked;

    // Delete user box — releases USER_VOTE_BOX_MBR from contract min balance,
    // making those funds available for the refund sendPayment below.
    this.userVotes(userVoteKey).delete();

    // Refund = stakeLocked + USER_VOTE_BOX_MBR 
    sendPayment({
      receiver: this.txn.sender,
      amount: stakeLocked + USER_VOTE_BOX_MBR,
    });
  }

  /**
   * Transfer platform ownership to a new address.
   * Only callable by the current platformOwner.
   *
   * @param newOwner - Address that will become the new platform owner
   *
   * @auth platformOwner only
   */
  updatePlatformOwner(newOwner: Address): void {
    assert(this.txn.sender === this.platformOwner.value, "not platform owner");
    
    this.platformOwner.value = newOwner;
  }

  /**
   * Sweep unclaimed stake for a specific user after the withdrawal deadline.
   * Only callable by platformOwner. Sends stake + MBR to platformOwner.
   *
   * @param voteId - Poll ID to sweep from
   * @param user   - Wallet address of the voter whose stake is being swept
   *
   * @auth platformOwner only
   */
  sweepUser(voteId: uint64, user: Address): void {
    assert(this.txn.sender === this.platformOwner.value, "not platform owner");
    assert(this.votes(voteId).exists, "vote does not exist");

    const voteState = this.votes(voteId).value;
    // Sweep is only allowed after the withdrawal deadline has passed
    assert(globals.latestTimestamp > voteState.withdrawDeadline, "withdrawal window not closed");

    const userVoteKey: UserVoteKey = { voteId: voteId, user: user };
    assert(this.userVotes(userVoteKey).exists, "no vote record found");

    const userVoteState = this.userVotes(userVoteKey).value;
    assert(!userVoteState.withdrawn, "already swept or withdrawn");

    const stakeLocked = userVoteState.stakeLocked;

    // Delete user box — releases USER_VOTE_BOX_MBR from contract min balance
    this.userVotes(userVoteKey).delete();

    // Forward stake + MBR to the platform owner
    sendPayment({
      receiver: this.platformOwner.value,
      amount: stakeLocked + USER_VOTE_BOX_MBR,
    });
  }

}
