import { z } from "zod";

// Slug: lowercase alphanumeric + dashes, 3-60 chars
const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * Zod schema for the POST /api/votes request body.
 * Validated server-side before signature verification and DB write.
 */
export const CreateVoteMetadataSchema = z.object({
  /** On-chain application ID (as string to avoid JSON BigInt issues) */
  appId: z.string().regex(/^\d+$/, "appId must be a numeric string"),
  /** On-chain vote ID returned by createVote (numeric string) */
  voteId: z.string().regex(/^\d+$/, "voteId must be a numeric string"),
  /** URL-friendly identifier (3–60 lowercase alphanumeric + dashes) */
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(60, "Slug must be at most 60 characters")
    .regex(SLUG_REGEX, "Slug must be lowercase alphanumeric with dashes only"),
  /** Human-readable poll title (max 100 chars, matching DB column) */
  title: z.string().min(1, "Title is required").max(100, "Title must be at most 100 characters"),
  /** Optional longer description */
  description: z.string().max(2000).optional(),
  /** Option labels — 2 to 8 non-empty strings */
  optionLabels: z
    .array(z.string().min(1, "Option label cannot be empty"))
    .min(2, "At least 2 options are required")
    .max(8, "At most 8 options are allowed"),
  /** Algorand address of the vote creator (58-char base32) */
  creatorWallet: z.string().length(58, "creatorWallet must be a valid Algorand address (58 chars)"),
  /**
   * Base64-encoded signature of the canonical creation message.
   * Produced client-side with algosdk.signBytes.
   */
  signature: z.string().min(1, "signature is required"),
});

export type CreateVoteMetadataInput = z.infer<typeof CreateVoteMetadataSchema>;
