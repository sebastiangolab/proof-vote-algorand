import { checkRateLimit, _store, _runCleanup } from "./rateLimit";

beforeEach(() => {
  // Reset store and fake timers before each test for full isolation
  _store.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Basic allow / deny ───────────────────────────────────────────────────────

describe("checkRateLimit — sliding window", () => {
  const IP = "192.168.1.1";

  it("allows the first 5 requests from the same IP", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(IP).allowed).toBe(true);
    }
  });

  it("denies the 6th request within the same minute", () => {
    for (let i = 0; i < 5; i++) checkRateLimit(IP);
    expect(checkRateLimit(IP).allowed).toBe(false);
  });

  it("returns retryAfter > 0 when denied", () => {
    for (let i = 0; i < 5; i++) checkRateLimit(IP);
    const result = checkRateLimit(IP);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("isolates requests by IP — different IPs don't share quota", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("10.0.0.1");
    // Different IP should still be allowed
    expect(checkRateLimit("10.0.0.2").allowed).toBe(true);
  });
});

// ─── Window reset ─────────────────────────────────────────────────────────────

describe("checkRateLimit — window reset after 1 minute", () => {
  const IP = "10.1.1.1";

  it("allows a new request after the window expires", () => {
    for (let i = 0; i < 5; i++) checkRateLimit(IP);
    expect(checkRateLimit(IP).allowed).toBe(false);

    // Advance time past the 1-minute window
    jest.advanceTimersByTime(61_000);

    // All 5 old timestamps are now outside the window → allowed again
    expect(checkRateLimit(IP).allowed).toBe(true);
  });

  it("only counts requests within the last 60 seconds", () => {
    // Make 3 requests, wait 30 s, make 2 more — total 5 within the window
    for (let i = 0; i < 3; i++) checkRateLimit(IP);
    jest.advanceTimersByTime(30_000);
    for (let i = 0; i < 2; i++) checkRateLimit(IP);

    // 6th should still be denied (all 5 are within 60 s)
    expect(checkRateLimit(IP).allowed).toBe(false);

    // Advance another 31 s — first 3 requests are now > 61 s old (outside window)
    jest.advanceTimersByTime(31_000);

    // Now only 2 requests remain in window → 3 more are allowed
    expect(checkRateLimit(IP).allowed).toBe(true);
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

describe("checkRateLimit — periodic cleanup", () => {
  it("removes stale IP entries from the store when cleanup runs", () => {
    const IP = "172.16.0.1";
    checkRateLimit(IP);
    expect(_store.has(IP)).toBe(true);

    // Advance time past the window so the entry becomes stale
    jest.advanceTimersByTime(61_000);

    // Manually invoke the cleanup (simulates the setInterval callback firing)
    _runCleanup();

    // The stale entry should have been removed
    expect(_store.has(IP)).toBe(false);
  });

  it("keeps entries that are still within the window after cleanup", () => {
    const IP = "172.16.0.2";
    checkRateLimit(IP); // record one request

    // Only 30 s pass — still within 60 s window
    jest.advanceTimersByTime(30_000);
    _runCleanup();

    // Entry should remain because it's not yet stale
    expect(_store.has(IP)).toBe(true);
  });
});
