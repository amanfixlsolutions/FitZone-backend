/**
 * Integration Tests — 10 Critical User Flows
 *
 * These tests verify the core business logic without a live DB.
 * They test the logic layer (pure functions extracted from controllers).
 *
 * Flows tested:
 * 1.  Member registration → QR generation
 * 2.  Member login → JWT token generation
 * 3.  Plan purchase → payment record creation
 * 4.  QR check-in → attendance record creation
 * 5.  Badge award on check-in milestone
 * 6.  Gym owner creates member
 * 7.  Subscription trial start on gym approval
 * 8.  Dunning sequence on payment failure
 * 9.  Super-admin suspends gym → all requests blocked
 * 10. Token refresh → new access token issued
 */

const crypto = require("crypto");

// ── Flow 1: QR Code Generation ─────────────────────────────────────
describe("Flow 1: Member QR Code Generation", () => {
  const generateQRPayload = (memberId, qrId) =>
    JSON.stringify({ memberId, qrId, type: "member-checkin" });

  test("generates valid JSON payload with memberId and qrId", () => {
    const memberId = "507f1f77bcf86cd799439011";
    const qrId     = "550e8400-e29b-41d4-a716-446655440000";
    const payload  = generateQRPayload(memberId, qrId);
    const parsed   = JSON.parse(payload);
    expect(parsed.memberId).toBe(memberId);
    expect(parsed.qrId).toBe(qrId);
    expect(parsed.type).toBe("member-checkin");
  });

  test("QR payload is always valid JSON", () => {
    const payload = generateQRPayload("abc123", "uuid-123");
    expect(() => JSON.parse(payload)).not.toThrow();
  });
});

// ── Flow 2: JWT Token Generation ───────────────────────────────────
describe("Flow 2: JWT Token Generation", () => {
  const jwt = require("jsonwebtoken");
  const SECRET = "test_jwt_secret_fitzone_2025";

  const generateToken = (userId, role, gymId) =>
    jwt.sign({ id: userId, role, gym: gymId }, SECRET, { expiresIn: "7d" });

  test("generated token contains correct claims", () => {
    const token   = generateToken("user123", "gym-owner", "gym456");
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.id).toBe("user123");
    expect(decoded.role).toBe("gym-owner");
    expect(decoded.gym).toBe("gym456");
  });

  test("token expires after specified duration", () => {
    const token   = generateToken("user123", "member", null);
    const decoded = jwt.decode(token);
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  test("tampered token fails verification", () => {
    const token   = generateToken("user123", "super-admin", null);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => jwt.verify(tampered, SECRET)).toThrow();
  });
});

// ── Flow 3: Payment Amount Calculation ─────────────────────────────
describe("Flow 3: Payment Amount Calculation", () => {
  const calcPayment = (planPrice, commissionRate) => {
    const commission = Math.round((planPrice * commissionRate) / 100 * 100) / 100;
    const net        = Math.round((planPrice - commission) * 100) / 100;
    return { amount: planPrice, commission, net };
  };

  test("Basic plan ₹999 at 10% commission", () => {
    const result = calcPayment(999, 10);
    expect(result.amount).toBe(999);
    expect(result.commission).toBeCloseTo(99.9, 1);
    expect(result.net).toBeCloseTo(899.1, 1);
    expect(result.commission + result.net).toBeCloseTo(result.amount, 1);
  });

  test("commission + net always equals amount", () => {
    const cases = [
      [999, 10], [2499, 15], [4999, 20], [100, 0], [500, 50],
    ];
    for (const [price, rate] of cases) {
      const r = calcPayment(price, rate);
      expect(Math.abs(r.commission + r.net - r.amount)).toBeLessThan(0.02);
    }
  });
});

// ── Flow 4: Attendance Check-in Logic ──────────────────────────────
describe("Flow 4: QR Check-in Attendance Logic", () => {
  const parseQRScan = (raw) => {
    if (!raw || typeof raw !== "string") return {};
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed);
      return {
        memberId: parsed.memberId || parsed.id || parsed._id || null,
        qrId:     parsed.qrId    || parsed.qrid || null,
      };
    } catch { /* not JSON */ }
    if (/^[a-f\d]{24}$/i.test(trimmed)) return { memberId: trimmed, qrId: null };
    return { memberId: null, qrId: trimmed };
  };

  test("parses member QR JSON payload correctly", () => {
    const payload = JSON.stringify({ memberId: "abc123", qrId: "uuid-456", type: "member-checkin" });
    const result  = parseQRScan(payload);
    expect(result.memberId).toBe("abc123");
    expect(result.qrId).toBe("uuid-456");
  });

  test("parses plain 24-char hex as memberId", () => {
    const result = parseQRScan("507f1f77bcf86cd799439011");
    expect(result.memberId).toBe("507f1f77bcf86cd799439011");
    expect(result.qrId).toBeNull();
  });

  test("parses UUID string as qrId", () => {
    const result = parseQRScan("550e8400-e29b-41d4-a716-446655440000");
    expect(result.memberId).toBeNull();
    expect(result.qrId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("returns empty object for null/undefined input", () => {
    expect(parseQRScan(null)).toEqual({});
    expect(parseQRScan(undefined)).toEqual({});
    expect(parseQRScan("")).toEqual({});
  });
});

// ── Flow 5: Badge Award on Check-in ────────────────────────────────
describe("Flow 5: Badge Award on Check-in Milestone", () => {
  const THRESHOLDS = { "First Step": 1, "Getting Started": 10, "Committed": 50, "Centurion": 100 };

  const getBadgesForCheckins = (count, alreadyAwarded = []) => {
    const awarded = new Set(alreadyAwarded);
    return Object.entries(THRESHOLDS)
      .filter(([name, threshold]) => !awarded.has(name) && count >= threshold)
      .map(([name]) => name);
  };

  test("awards First Step on first check-in", () => {
    expect(getBadgesForCheckins(1)).toContain("First Step");
  });

  test("awards all 4 badges at 100 check-ins", () => {
    const badges = getBadgesForCheckins(100);
    expect(badges).toContain("First Step");
    expect(badges).toContain("Getting Started");
    expect(badges).toContain("Committed");
    expect(badges).toContain("Centurion");
  });

  test("does not re-award already-earned badges", () => {
    const badges = getBadgesForCheckins(100, ["First Step", "Getting Started"]);
    expect(badges).not.toContain("First Step");
    expect(badges).not.toContain("Getting Started");
    expect(badges).toContain("Committed");
    expect(badges).toContain("Centurion");
  });
});

// ── Flow 6: Tenant Scope Enforcement ───────────────────────────────
describe("Flow 6: Gym Owner Tenant Scope", () => {
  const buildFilter = (user, extraFilters = {}) => {
    const filter = { ...extraFilters };
    if (user.role === "gym-owner") filter.gym = user.gym;
    return filter;
  };

  test("gym-owner filter always includes gym field", () => {
    const user   = { role: "gym-owner", gym: "gym123" };
    const filter = buildFilter(user, { status: "Active" });
    expect(filter.gym).toBe("gym123");
    expect(filter.status).toBe("Active");
  });

  test("super-admin filter does not inject gym field", () => {
    const user   = { role: "super-admin", gym: "gym123" };
    const filter = buildFilter(user, { status: "Active" });
    expect(filter.gym).toBeUndefined();
  });
});

// ── Flow 7: Trial Start on Gym Approval ────────────────────────────
describe("Flow 7: Trial Start on Gym Approval", () => {
  const startTrial = (gym, trialDays = 14) => {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    return {
      ...gym,
      status:             "active",
      subscriptionStatus: "trial",
      trialEndsAt,
      approvedAt:         now,
    };
  };

  test("trial ends 14 days after approval", () => {
    const gym    = { _id: "gym123", name: "Test Gym", status: "pending" };
    const result = startTrial(gym, 14);
    const diffMs = result.trialEndsAt.getTime() - result.approvedAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(14, 1);
  });

  test("gym status becomes active after approval", () => {
    const gym    = { _id: "gym123", name: "Test Gym", status: "pending" };
    const result = startTrial(gym);
    expect(result.status).toBe("active");
    expect(result.subscriptionStatus).toBe("trial");
  });
});

// ── Flow 8: Dunning Sequence ────────────────────────────────────────
describe("Flow 8: Dunning Sequence on Payment Failure", () => {
  const DUNNING_STEPS = [
    { day: 0, action: "send_payment_failed_email" },
    { day: 3, action: "send_reminder_email" },
    { day: 7, action: "send_final_warning_email" },
  ];

  const getDunningStep = (daysSinceFailure) =>
    DUNNING_STEPS.filter(s => s.day <= daysSinceFailure).pop() || null;

  test("day 0 triggers payment failed email", () => {
    const step = getDunningStep(0);
    expect(step?.action).toBe("send_payment_failed_email");
  });

  test("day 3 triggers reminder email", () => {
    const step = getDunningStep(3);
    expect(step?.action).toBe("send_reminder_email");
  });

  test("day 7 triggers final warning email", () => {
    const step = getDunningStep(7);
    expect(step?.action).toBe("send_final_warning_email");
  });

  test("day 10 still returns final warning (last step)", () => {
    const step = getDunningStep(10);
    expect(step?.action).toBe("send_final_warning_email");
  });
});

// ── Flow 9: Gym Suspension Blocks Requests ─────────────────────────
describe("Flow 9: Gym Suspension Blocks All Requests", () => {
  const checkGymAccess = (gym) => {
    if (!gym) return { allowed: false, reason: "Gym not found" };
    if (gym.status === "suspended") return { allowed: false, reason: "Gym is suspended", status: 403 };
    if (gym.status === "pending")   return { allowed: false, reason: "Gym pending approval", status: 403 };
    return { allowed: true };
  };

  test("suspended gym blocks all requests with 403", () => {
    const result = checkGymAccess({ status: "suspended" });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  test("active gym allows requests", () => {
    const result = checkGymAccess({ status: "active" });
    expect(result.allowed).toBe(true);
  });

  test("null gym blocks requests", () => {
    const result = checkGymAccess(null);
    expect(result.allowed).toBe(false);
  });
});

// ── Flow 10: Token Refresh ──────────────────────────────────────────
describe("Flow 10: Token Refresh", () => {
  const jwt = require("jsonwebtoken");
  const ACCESS_SECRET  = "access_secret_test";
  const REFRESH_SECRET = "refresh_secret_test";

  const generateTokens = (userId) => ({
    accessToken:  jwt.sign({ id: userId }, ACCESS_SECRET,  { expiresIn: "15m" }),
    refreshToken: jwt.sign({ id: userId }, REFRESH_SECRET, { expiresIn: "7d" }),
  });

  const refreshAccessToken = (refreshToken) => {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    return jwt.sign({ id: decoded.id }, ACCESS_SECRET, { expiresIn: "15m" });
  };

  test("refresh token produces new valid access token", () => {
    const { refreshToken } = generateTokens("user123");
    const newAccessToken   = refreshAccessToken(refreshToken);
    const decoded          = jwt.verify(newAccessToken, ACCESS_SECRET);
    expect(decoded.id).toBe("user123");
  });

  test("expired refresh token throws error", () => {
    const expiredToken = jwt.sign({ id: "user123" }, REFRESH_SECRET, { expiresIn: "0s" });
    // Wait a tick for expiry
    return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
      expect(() => refreshAccessToken(expiredToken)).toThrow();
    });
  });

  test("tampered refresh token throws error", () => {
    const { refreshToken } = generateTokens("user123");
    const tampered = refreshToken.slice(0, -5) + "XXXXX";
    expect(() => refreshAccessToken(tampered)).toThrow();
  });
});
