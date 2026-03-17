import algosdk from "algosdk";

/**
 * Returns an HTTP client for the Algorand node (algod).
 * Used by all on-chain read functions in this file.
 *
 * Defaults to the public AlgoNode TestNet endpoint — override via:
 *   NEXT_PUBLIC_ALGOD_SERVER / NEXT_PUBLIC_ALGOD_PORT / NEXT_PUBLIC_ALGOD_TOKEN
 */
export function getAlgodClient(): algosdk.Algodv2 {
  const server = process.env.NEXT_PUBLIC_ALGOD_SERVER ?? "https://testnet-api.algonode.cloud";
  const port = process.env.NEXT_PUBLIC_ALGOD_PORT ?? "443";
  const token = process.env.NEXT_PUBLIC_ALGOD_TOKEN ?? "";
  
  return new algosdk.Algodv2(token, server, port);
}
