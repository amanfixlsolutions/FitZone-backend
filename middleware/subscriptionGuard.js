const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Gym = require("../models/Gym");

// ── subscriptionGuard — blocks writes on expired subscriptions ────
// GET requests always allowed (read-only mode during grace period)
// Returns 402 with renewalUrl when subscription expired past grace period
// Returns 403 when gym is suspended
// Super-admin and non-gym-owner roles bypass
exports.subscriptionGuard = asyncHandler(async (req, res, next) => {
  // Only applies to gym-owner role
  if (!req.user || req.user.role !== "gym-owner") return next();

  // GET requests always pass through (read-only mode)
  if (req.method === "GET") return next();

  const tenantId = req.tenantId || req.user.gym;
  if (!tenantId) return next();

  const gym = await Gym.findById(tenantId).select("status subscription").lean();
  if (!gym) return next(new AppError("Gym not found.", 404));

  // Suspended gym — hard block
  if (gym.status === "suspended") {
    return next(new AppError("Tenant suspended.", 403));
  }

  // Expired subscription — check grace period
  if (gym.subscription?.status === "expired") {
    const expiryDate = gym.subscription.expiryDate;
    if (expiryDate) {
      const gracePeriodEnd = new Date(expiryDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

      if (new Date() > gracePeriodEnd) {
        return res.status(402).json({
          success: false,
          message: "Subscription expired. Please renew.",
          renewalUrl: "/gym-owner/subscription/renew",
        });
      }
    }
  }

  next();
});
