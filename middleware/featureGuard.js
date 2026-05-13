const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const TenantConfig = require("../models/TenantConfig");

// ── featureGuard(featureName) — factory function returning middleware ─
// Usage: router.post('/broadcast', protect, gymOwnerOnly, tenantScope, featureGuard('campaigns'), controller)
exports.featureGuard = (featureName) =>
  asyncHandler(async (req, res, next) => {
    // Super-admin bypasses all feature checks
    if (!req.user || req.user.role === "super-admin") return next();

    const tenantId = req.tenantId || req.user.gym;
    if (!tenantId) return next();

    const config = await TenantConfig.findOne({ gym: tenantId })
      .select("featureFlags")
      .lean();

    if (config && config.featureFlags[featureName] === false) {
      return next(
        new AppError(
          `Feature '${featureName}' is not enabled for your subscription plan.`,
          403
        )
      );
    }

    next();
  });
