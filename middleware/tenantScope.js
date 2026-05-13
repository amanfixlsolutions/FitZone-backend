const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const ActivityLog = require("../models/ActivityLog");

// ── tenantScope — injects req.tenantId for gym-owner requests ─────
exports.tenantScope = (req, res, next) => {
  if (req.user?.role === "gym-owner") {
    req.tenantId = req.user.gym;
  }
  next();
};

// ── tenantGuard — hard-blocks cross-tenant resource access ────────
// Checks if gymId in params/body/query matches req.user.gym for gym-owner role
// Logs violations to ActivityLog
// Super-admin bypasses
exports.tenantGuard = asyncHandler(async (req, res, next) => {
  if (!req.user || req.user.role !== "gym-owner") return next();

  const gymId =
    req.params.gymId ||
    req.body.gym ||
    req.query.gymId ||
    req.query.gym;

  if (gymId && req.user.gym?.toString() !== gymId.toString()) {
    // Log the violation (non-blocking)
    await ActivityLog.create({
      user:     req.user._id,
      userName: req.user.name,
      role:     req.user.role,
      action:   "CROSS_TENANT_ATTEMPT",
      module:   "Security",
      details:  `Cross-tenant access attempt: user gym=${req.user.gym}, requested gym=${gymId}`,
      ip:       req.ip,
      status:   "failed",
    }).catch(() => {});

    return next(new AppError("Access denied. You can only manage your own gym.", 403));
  }

  next();
});
