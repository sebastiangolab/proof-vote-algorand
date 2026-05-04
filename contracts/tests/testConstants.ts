import path from "path";

export const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");

export const STAKE = 1_000_000; // Default STAKE for tests (can be overridden in createVote calls)

export const DEFAULT_END_AT_OFFSET = BigInt(3600); // endAt = now + 1 hour