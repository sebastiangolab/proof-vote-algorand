// ─── Global ───────────────────────────────────────────────────────────────────

// Algorand public key / address bytes
export const ADDRESS_SIZE = 32

// ARC-4 uint64 bytes
export const UINT64_SIZE  = 8

//  MBR formula (Algorand protocol constants):
//    2,500 µALGO — flat fee per box
//    400 µALGO   — per byte of (boxNameSize + boxValueSize)

// ─── VoteState ────────────────────────────────────────────────────────────────

//  Box name: 'v' (1B) + voteId uint64 (8B) = 9B
export const VOTE_BOX_PREFIX    = 0x76 // ASCII 'v'
export const VOTE_BOX_NAME_SIZE = 9    // 1 + 8

//  Box value layout (136B):
//    offset   0 : creator          Address   32B
//    offset  32 : startAt          uint64     8B
//    offset  40 : endAt            uint64     8B
//    offset  48 : stake            uint64     8B
//    offset  56 : withdrawDeadline uint64     8B
//    offset  64 : optionCount      uint64     8B
//    offset  72 : counts[0..7]     uint64[8] 64B
export const VOTE_STATE_SIZE               = 136
export const VOTE_CREATOR_OFFSET           = 0
export const VOTE_START_AT_OFFSET          = 32
export const VOTE_END_AT_OFFSET            = 40
export const VOTE_STAKE_OFFSET             = 48
export const VOTE_WITHDRAW_DEADLINE_OFFSET = 56
export const VOTE_OPTION_COUNT_OFFSET      = 64
export const VOTE_COUNTS_OFFSET            = 72

//  VOTE_BOX_MBR: 2500 + 400 × (9 + 136) = 60,500 µALGO
//  Read formula above for details on how this is calculated.
export const VOTE_BOX_MBR = 60500

// ─── UserVoteState ────────────────────────────────────────────────────────────

//  Box name: 'u' (1B) + voteId uint64 (8B) + pubkey (32B) = 41B
export const USER_BOX_PREFIX    = 0x75 // ASCII 'u'
export const USER_BOX_NAME_SIZE = 41   // 1 + 8 + 32

//  Box value layout (17B):
//    offset  0 : voted(bit7) + withdrawn(bit6)  packed bool byte   1B
//    offset  1 : choice                         uint64             8B
//    offset  9 : stakeLocked                    uint64             8B
//
//  ARC-4 packs consecutive booleans into a single byte, MSB first.
//  voted → bit 7 (0x80), withdrawn → bit 6 (0x40); remaining bits are padding.
export const USER_VOTE_STATE_SIZE          = 17
export const USER_VOTE_BOOL_BYTE           = 0    // byte index of the packed bool byte
export const USER_VOTE_VOTED_BIT           = 0x80 // bit mask for voted   (bit 7)
export const USER_VOTE_WITHDRAWN_BIT       = 0x40 // bit mask for withdrawn (bit 6)
export const USER_VOTE_CHOICE_OFFSET       = 1
export const USER_VOTE_STAKE_LOCKED_OFFSET = 9

//  USER_VOTE_BOX_MBR: 2500 + 400 × (41 + 17) = 25,700 µALGO
//  Read formula above for details on how this is calculated.
export const USER_VOTE_BOX_MBR = 25700
