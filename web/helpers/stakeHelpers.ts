// Function to split an array into chunks of given size
// used to batch transactions in groups of 16 (Algorand's limit for group size)
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));

  return chunks;
}

// Shorten an Algorand address for display, e.g. "ALGO…1234"
export function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export { formatDate } from "@/helpers/votesHelpers";