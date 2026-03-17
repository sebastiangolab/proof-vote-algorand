export function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeLeft(endAt: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const diff = endAt - now;

  if (diff <= 0n) return "Ended";

  const s = Number(diff);

  if (s < 3600) return `${Math.ceil(s / 60)}m left`;
  if (s < 86400) return `${Math.ceil(s / 3600)}h left`;
  
  return `${Math.ceil(s / 86400)}d left`;
}
