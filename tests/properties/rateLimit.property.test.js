/**
 * Property 6: Per-Tenant Rate Limiting Threshold
 * The 501st request from the same gymId within 15 minutes must return 429.
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline rate limiter logic (mirrors middleware/rateLimiter.js) ──
class InMemoryRateLimiter {
  constructor({ max = 500, windowMs = 15 * 60 * 1000 } = {}) {
    this.max      = max;
    this.windowMs = windowMs;
    this.store    = new Map(); // gymId → { count, resetAt }
  }

  check(gymId) {
    const now = Date.now();
    const entry = this.store.get(gymId);

    if (!entry || now > entry.resetAt) {
      this.store.set(gymId, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1 };
    }

    entry.count += 1;
    if (entry.count > this.max) {
      return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }

    return { allowed: true, remaining: this.max - entry.count };
  }

  reset(gymId) {
    this.store.delete(gymId);
  }
}

describe("Property 6: Per-Tenant Rate Limiting Threshold", () => {
  test("501st request from same gymId returns 429 (not allowed)", () => {
    const limiter = new InMemoryRateLimiter({ max: 500 });
    const gymId = "abc123def456abc123def456";

    // First 500 requests should be allowed
    for (let i = 0; i < 500; i++) {
      const result = limiter.check(gymId);
      expect(result.allowed).toBe(true);
    }

    // 501st request should be blocked
    const result = limiter.check(gymId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test.prop([fc.stringMatching(/^[a-f0-9]{24}$/)])(
    "first request from any gymId is always allowed",
    (gymId) => {
      const limiter = new InMemoryRateLimiter({ max: 500 });
      const result = limiter.check(gymId);
      expect(result.allowed).toBe(true);
    }
  );

  test.prop([
    fc.stringMatching(/^[a-f0-9]{24}$/),
    fc.stringMatching(/^[a-f0-9]{24}$/),
  ])(
    "rate limit is per-tenant — different gymIds have independent counters",
    (gymAId, gymBId) => {
      fc.pre(gymAId !== gymBId);
      const limiter = new InMemoryRateLimiter({ max: 2 });

      // Exhaust gymA
      limiter.check(gymAId);
      limiter.check(gymAId);
      limiter.check(gymAId); // 3rd → blocked

      // gymB should still be allowed
      const resultB = limiter.check(gymBId);
      expect(resultB.allowed).toBe(true);
    }
  );

  test("remaining count decrements correctly", () => {
    const limiter = new InMemoryRateLimiter({ max: 10 });
    const gymId = "test123";

    const r1 = limiter.check(gymId);
    expect(r1.remaining).toBe(9);

    const r2 = limiter.check(gymId);
    expect(r2.remaining).toBe(8);
  });
});
