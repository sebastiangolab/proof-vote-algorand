// Serialize a VoteMetadata record for JSON responses — converts BigInt fields to strings
export function serializeVoteRecord<T extends { voteId: bigint; appId: bigint }>(
  record: T
): Omit<T, "voteId" | "appId"> & { voteId: string; appId: string } {
  return { ...record, voteId: record.voteId.toString(), appId: record.appId.toString() };
}

// Helper function to check if an error is a Prisma unique constraint violation (code P2002)
export function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}