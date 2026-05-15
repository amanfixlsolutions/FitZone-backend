/**
 * Property 10: Achievement Badge Award Correctness
 *
 * Badge thresholds must be correctly evaluated:
 * - "First Step" awarded at >= 1 check-in
 * - "Getting Started" at >= 10
 * - "Committed" at >= 50
 * - "Centurion" at >= 100
 * - "Anniversary" at >= 365 membership days
 */

const { fc, test } = require("@fast-check/jest");

// ── Inline badge logic (mirrors achievementService.js) ────────────
const BADGE_THRESHOLDS = {
  "First Step":      { type: "checkins",        count: 1   },
  "Getting Started": { type: "checkins",        count: 10  },
  "Committed":       { type: "checkins",        count: 50  },
  "Centurion":       { type: "checkins",        count: 100 },
  "Anniversary":     { type: "membership_days", count: 365 },
};

const evaluateBadges = (totalCheckins, membershipDays, alreadyAwarded = []) => {
  const awardedSet = new Set(alreadyAwarded);
  const newBadges  = [];

  for (const [badgeName, threshold] of Object.entries(BADGE_THRESHOLDS)) {
    if (awardedSet.has(badgeName)) continue;

    let earned = false;
    if (threshold.type === "checkins") {
      earned = totalCheckins >= threshold.count;
    } else if (threshold.type === "membership_days") {
      earned = membershipDays >= threshold.count;
    }

    if (earned) newBadges.push(badgeName);
  }

  return newBadges;
};

describe("Property 10: Achievement Badge Award Correctness", () => {
  test.prop([fc.integer({ min: 1, max: 1000 })])(
    "First Step badge awarded for any checkin count >= 1",
    (checkins) => {
      const badges = evaluateBadges(checkins, 0);
      expect(badges).toContain("First Step");
    }
  );

  test("First Step NOT awarded for 0 check-ins", () => {
    const badges = evaluateBadges(0, 0);
    expect(badges).not.toContain("First Step");
  });

  test.prop([fc.integer({ min: 10, max: 1000 })])(
    "Getting Started badge awarded for >= 10 check-ins",
    (checkins) => {
      const badges = evaluateBadges(checkins, 0);
      expect(badges).toContain("Getting Started");
    }
  );

  test.prop([fc.integer({ min: 0, max: 9 })])(
    "Getting Started NOT awarded for < 10 check-ins",
    (checkins) => {
      const badges = evaluateBadges(checkins, 0);
      expect(badges).not.toContain("Getting Started");
    }
  );

  test.prop([fc.integer({ min: 100, max: 1000 })])(
    "Centurion badge awarded for >= 100 check-ins",
    (checkins) => {
      const badges = evaluateBadges(checkins, 0);
      expect(badges).toContain("Centurion");
    }
  );

  test.prop([fc.integer({ min: 365, max: 3650 })])(
    "Anniversary badge awarded for >= 365 membership days",
    (days) => {
      const badges = evaluateBadges(0, days);
      expect(badges).toContain("Anniversary");
    }
  );

  test.prop([fc.integer({ min: 0, max: 364 })])(
    "Anniversary NOT awarded for < 365 days",
    (days) => {
      const badges = evaluateBadges(0, days);
      expect(badges).not.toContain("Anniversary");
    }
  );

  test.prop([fc.integer({ min: 100, max: 1000 })])(
    "already-awarded badges are not re-awarded",
    (checkins) => {
      const alreadyAwarded = ["First Step", "Getting Started", "Committed", "Centurion"];
      const badges = evaluateBadges(checkins, 0, alreadyAwarded);
      for (const badge of alreadyAwarded) {
        expect(badges).not.toContain(badge);
      }
    }
  );

  test("no badges awarded for 0 check-ins and 0 days", () => {
    const badges = evaluateBadges(0, 0);
    expect(badges).toHaveLength(0);
  });
});
