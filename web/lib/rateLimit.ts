// Sliding-window in-memory rate limiter.
// Limitation: state is not shared across Vercel serverless instances.
// Acceptable for low-traffic TestNet; use Upstash Redis post-MVP.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // clean up stale entries every 5 minutes

// IP → list of request timestamps (ms) within the current window
const requestStore = new Map<string, number[]>();

/** Exported for test inspection only — do not use in production code. */
export const _store = requestStore;

function cleanup(): void {
  const now = Date.now();

  // Remove timestamps older than the window and delete IPs with no recent requests
  for (const [ip, timestamps] of requestStore.entries()) {
    const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) {
      requestStore.delete(ip);
    } else {
      requestStore.set(ip, fresh);
    }
  }
}

/** Exported for direct invocation in tests — bypasses the setInterval timer. */
export function _runCleanup(): void {
  cleanup();
}

// Periodic cleanup — unref() so the timer won't keep Node / Jest alive
const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (typeof (cleanupTimer as NodeJS.Timeout).unref === "function") {
  (cleanupTimer as NodeJS.Timeout).unref();
}

/**
 * Checks whether the given IP is allowed to make another request.
 * Records the request if allowed.
 *
 * @param ip - Client IP address (from x-forwarded-for or socket)
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfter: seconds }`
 */
export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  // Keep only timestamps within the current window
  const timestamps = (requestStore.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    // Oldest timestamp determines when the window resets
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  timestamps.push(now);
  requestStore.set(ip, timestamps);
  return { allowed: true };
}
