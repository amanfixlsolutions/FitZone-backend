const Member = require("../models/Member");

// ─────────────────────────────────────────────────────────────────
// Badge thresholds
// ─────────────────────────────────────────────────────────────────
const BADGE_THRESHOLDS = {
  "First Step":      { type: "checkins",        count: 1   },
  "Getting Started": { type: "checkins",        count: 10  },
  "Committed":       { type: "checkins",        count: 50  },
  "Centurion":       { type: "checkins",        count: 100 },
  "Anniversary":     { type: "membership_days", count: 365 },
  "Loyal Member":    { type: "plan_renewal",    count: 1   },
};

// ─────────────────────────────────────────────────────────────────
// checkAndAwardBadges — called after each check-in
// Returns array of newly awarded badge names
// ─────────────────────────────────────────────────────────────────
exports.checkAndAwardBadges = async (memberId) => {
  const member = await Member.findById(memberId);
  if (!member) return [];

  const newBadges = [];
  const now = new Date();

  // Calculate membership days
  const joinDate = member.joinDate || member.createdAt || now;
  const membershipDays = Math.floor((now - new Date(joinDate)) / (1000 * 60 * 60 * 24));

  // Already-awarded badge names for quick lookup
  const awardedNames = new Set((member.achievements || []).map(a => a.badge));

  for (const [badgeName, threshold] of Object.entries(BADGE_THRESHOLDS)) {
    // Skip plan_renewal badges — those are awarded via awardBadge() on payment
    if (threshold.type === "plan_renewal") continue;

    // Skip already-awarded badges
    if (awardedNames.has(badgeName)) continue;

    let earned = false;

    if (threshold.type === "checkins") {
      earned = (member.totalCheckins || 0) >= threshold.count;
    } else if (threshold.type === "membership_days") {
      earned = membershipDays >= threshold.count;
    }

    if (earned) {
      member.achievements.push({ badge: badgeName, awardedAt: now });
      awardedNames.add(badgeName);
      newBadges.push(badgeName);
    }
  }

  if (newBadges.length > 0) {
    await member.save();
  }

  return newBadges;
};

// ─────────────────────────────────────────────────────────────────
// awardBadge — called on specific events (e.g. plan renewal)
// Returns the awarded badge object, or null if already had it
// ─────────────────────────────────────────────────────────────────
exports.awardBadge = async (memberId, badgeName) => {
  const member = await Member.findById(memberId);
  if (!member) return null;

  // Check if already awarded
  const alreadyAwarded = (member.achievements || []).some(a => a.badge === badgeName);
  if (alreadyAwarded) return null;

  const badge = { badge: badgeName, awardedAt: new Date() };
  member.achievements.push(badge);
  await member.save();

  return badge;
};
