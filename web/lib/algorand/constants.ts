// ─── Box name layout ──────────────────────────────────────────────────────────
//
//   Vote box:      0x76 'v' (1B) + voteId uint64 (8B)              = 9B total
//   User vote box: 0x75 'u' (1B) + voteId uint64 (8B) + pubkey (32B) = 41B total

export const VOTE_BOX_PREFIX    = 0x76  // ASCII 'v'
export const USER_BOX_PREFIX    = 0x75  // ASCII 'u'
export const ADDRESS_SIZE       = 32    // Algorand public key / address bytes
export const UINT64_SIZE        = 8     // ARC-4 uint64 bytes
export const VOTE_BOX_NAME_SIZE = 9     // 1 + 8
export const USER_BOX_NAME_SIZE = 41    // 1 + 8 + 32

// ─── VoteState byte offsets (VOTE_STATE_SIZE = 136 bytes, ARC-4 encoding) ────
//
//   offset   0 : creator          Address   32B
//   offset  32 : startAt          uint64     8B
//   offset  40 : endAt            uint64     8B
//   offset  48 : stake            uint64     8B
//   offset  56 : withdrawDeadline uint64     8B
//   offset  64 : optionCount      uint64     8B
//   offset  72 : counts[0..7]     uint64[8] 64B  — element i at VOTE_COUNTS_OFFSET + i * UINT64_SIZE

export const VOTE_STATE_SIZE               = 136
export const VOTE_CREATOR_OFFSET           = 0
export const VOTE_START_AT_OFFSET          = 32
export const VOTE_END_AT_OFFSET            = 40
export const VOTE_STAKE_OFFSET             = 48
export const VOTE_WITHDRAW_DEADLINE_OFFSET = 56
export const VOTE_OPTION_COUNT_OFFSET      = 64
export const VOTE_COUNTS_OFFSET            = 72

// ─── UserVoteState byte offsets (USER_VOTE_STATE_SIZE = 17 bytes, ARC-4 encoding) ─
//
//   offset  0 : voted(bit7) + withdrawn(bit6)  packed bool byte   1B
//   offset  1 : choice                         uint64             8B
//   offset  9 : stakeLocked                    uint64             8B
//
//   ARC-4 packs consecutive booleans into a single byte, MSB first.
//   voted → bit 7 (0x80), withdrawn → bit 6 (0x40); remaining bits are padding.

export const USER_VOTE_STATE_SIZE          = 17
export const USER_VOTE_BOOL_BYTE           = 0     // byte index of the packed bool byte
export const USER_VOTE_VOTED_BIT           = 0x80  // bit mask for voted   (bit 7)
export const USER_VOTE_WITHDRAWN_BIT       = 0x40  // bit mask for withdrawn (bit 6)
export const USER_VOTE_CHOICE_OFFSET       = 1
export const USER_VOTE_STAKE_LOCKED_OFFSET = 9

// ─── Unit conversion ─────────────────────────────────────────────────────────

export const MICRO_ALGO = 1_000_000  // µALGO per ALGO

// ─── Minimum Balance Reserve (MBR) ───────────────────────────────────────────
//
//   Formula: 2500 + 400 × (boxNameSize + boxValueSize)  (µALGO)
//
//   VOTE_BOX_MBR:      2500 + 400 × (9 + 136)  = 60,500 µALGO
//   USER_VOTE_BOX_MBR: 2500 + 400 × (41 + 17)  = 25,700 µALGO

export const VOTE_BOX_MBR      = 60_500n  // bigint — matches algosdk v3 payment amounts
export const USER_VOTE_BOX_MBR = 25_700n  // bigint

// ─── Transaction fees ─────────────────────────────────────────────────────────
//
//   vote() sends a group of 2 transactions: PayTxn + AppCall — each 1000 µALGO

export const ALGO_TX_FEE  = 1_000n  // µALGO per single transaction
export const VOTE_TX_FEE  = 2n * ALGO_TX_FEE  // 2 txns in the vote group
