/**
 * Property 7: Subscription Expiry Grace Period
 * - Writes blocked (402) when subscription expired past 7-day grace period
 * - Reads allowed even when subscription is expired
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline subscription guard logic (mirrors middleware/subscriptionGuard.js) ─
const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS   = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

const checkSubscription = (gym, method) => {
  if (!gym) return { allowed: false, status: 402, reason: "No gym found" };

  // Active or trial — always allowed
  if (["active", "trial"].includes(gym.subscriptionStatus)) {
    return { allowed: true };
  }

  // Expired — check grace period
  if (gym.subscriptionStatus === "expired") {
    const expiredAt = gym.subscriptionExpiredAt ? new Date(gym.subscriptionExpiredAt).getTime() : 0;
    const now       = Date.now();
    const withinGrace = (now - expiredAt) <= GRACE_PERIOD_MS;

    // Reads always allowed
    if (method === "GET") return { allowed: true };

    // Writes blocked after grace period
    if (!withinGrace) {
      return { allowed: false, status: 402, reason: "Subscription expired. Please renew." };
    }

    return { allowed: true }; // within grace period
  }

  // Suspended — always blocked
  if (gym.subscriptionStatus === "suspended") {
    return { allowed: false, status: 403, reason: "Gym is suspended." };
  }

  return { allowed: true };
};

describe("Property 7: Subscription Expiry Grace Period", () => {
  test.prop([
    fc.constantFrom("POST", "PUT", "PATCH", "DELETE"),
  ])(
    "write operations blocked (402) when expired past grace period",
    (method) => {
      const gym = {
        subscriptionStatus:    "expired",
        subscriptionExpiredAt: new Date(Date.now() - (GRACE_PERIOD_MS + 86400000)), // 8 days ago
      };
      const result = checkSubscription(gym, method);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(402);
    }
  );

  test.prop([
    fc.constantFrom("POST", "PUT", "PATCH", "DELETE"),
  ])(
    "write operations allowed within grace period",
    (method) => {
      const gym = {
        subscriptionStatus:    "expired",
        subscriptionExpiredAt: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)), // 3 days ago
      };
      const result = checkSubscription(gym, method);
      expect(result.allowed).toBe(true);
    }
  );

  test("GET requests always allowed even when expired past grace period", () => {
    const gym = {
      subscriptionStatus:    "expired",
      subscriptionExpiredAt: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)), // 30 days ago
    };
    const result = checkSubscription(gym, "GET");
    expect(result.allowed).toBe(true);
  });

  test.prop([
    fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE"),
  ])(
    "active subscription always allows all methods",
    (method) => {
      const gym = { subscriptionStatus: "active" };
      const result = checkSubscription(gym, method);
      expect(result.allowed).toBe(true);
    }
  );

  test.prop([
    fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE"),
  ])(
    "trial subscription always allows all methods",
    (method) => {
      const gym = { subscriptionStatus: "trial" };
      const result = checkSubscription(gym, method);
      expect(result.allowed).toBe(true);
    }
  );
});
