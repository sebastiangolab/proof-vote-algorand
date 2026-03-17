export function toUnixSec(datetimeLocal: string): bigint {
  return BigInt(Math.floor(new Date(datetimeLocal).getTime() / 1000));
}