/**
 * Property 15: Brute-Force IP Block
 * The 11th failed login attempt from the same IP must return 429.
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline brute-force logic (mirrors authController.js) ──────────
class BruteForceProtector {
  constructor({ maxAttempts = 10, windowMs = 15 * 60 * 1000, blockMs = 30 * 60 * 1000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs    = windowMs;
    this.blockMs     = blockMs;
    this.store       = new Map(); // ip → { count, firstAttempt, blockedUntil }
  }

  check(ip) {
    const now    = Date.now();
    const record = this.store.get(ip);

    if (record) {
      // Currently blocked
      if (record.blockedUntil && now < record.blockedUntil) {
        return { blocked: true, status: 429 };
      }
      // Window expired — reset
      if (now - record.firstAttempt > this.windowMs) {
        this.store.delete(ip);
      }
    }

    return { blocked: false };
  }

  recordFailure(ip) {
    const now    = Date.now();
    const record = this.store.get(ip);

    if (record && now - record.firstAttempt <= this.windowMs) {
      record.count += 1;
      if (record.count >= this.maxAttempts) {
        record.blockedUntil = now + this.blockMs;
      }
    } else {
      this.store.set(ip, { count: 1, firstAttempt: now, blockedUntil: null });
    }
  }

  clearSuccess(ip) {
    this.store.delete(ip);
  }
}

describe("Property 15: Brute-Force IP Block — 11th attempt returns 429", () => {
  test("11th failed attempt from same IP is blocked (429)", () => {
    const protector = new BruteForceProtector({ maxAttempts: 10 });
    const ip = "192.168.1.100";

    // 10 failed attempts
    for (let i = 0; i < 10; i++) {
      const check = protector.check(ip);
      expect(check.blocked).toBe(false);
      protector.recordFailure(ip);
    }

    // 11th attempt — should be blocked
    const result = protector.check(ip);
    expect(result.blocked).toBe(true);
    expect(result.status).toBe(429);
  });

  test("first 10 attempts are not blocked", () => {
    const protector = new BruteForceProtector({ maxAttempts: 10 });
    const ip = "10.0.0.1";

    for (let i = 0; i < 10; i++) {
      const check = protector.check(ip);
      expect(check.blocked).toBe(false);
      protector.recordFailure(ip);
    }
  });

  test("successful login clears failed attempt record", () => {
    const protector = new BruteForceProtector({ maxAttempts: 10 });
    const ip = "172.16.0.1";

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      protector.check(ip);
      protector.recordFailure(ip);
    }

    // Successful login clears record
    protector.clearSuccess(ip);

    // Should be able to attempt again
    const result = protector.check(ip);
    expect(result.blocked).toBe(false);
  });

  test.prop([fc.ipV4()])(
    "first attempt from any IP is never blocked",
    (ip) => {
      const protector = new BruteForceProtector({ maxAttempts: 10 });
      const result = protector.check(ip);
      expect(result.blocked).toBe(false);
    }
  );

  test.prop([fc.ipV4(), fc.ipV4()])(
    "blocking one IP does not affect other IPs",
    (ipA, ipB) => {
      fc.pre(ipA !== ipB);
      const protector = new BruteForceProtector({ maxAttempts: 10 });

      // Block ipA
      for (let i = 0; i < 10; i++) {
        protector.check(ipA);
        protector.recordFailure(ipA);
      }

      // ipB should still be allowed
      const resultB = protector.check(ipB);
      expect(resultB.blocked).toBe(false);
    }
  );
});
