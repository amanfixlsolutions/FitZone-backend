const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const ActivityLog = require("../models/ActivityLog");

const { getTenantGymId } = require("../utils/tenantFilter");

// ── tenantScope — injects req.tenantId for tenant-scoped roles ────
exports.tenantScope = (req, res, next) => {
  const tenantId = getTenantGymId(req.user);
  if (tenantId) req.tenantId = tenantId;
  next();
};

// ── tenantGuard — hard-blocks cross-tenant resource access ────────
// Checks if gymId in params/body/query matches the user's gym (owner + member)
// Logs violations to ActivityLog
// Super-admin bypasses
exports.tenantGuard = asyncHandler(async (req, res, next) => {
  if (!req.user || req.user.role === "super-admin") return next();

  const tenantGym = getTenantGymId(req.user);
  if (!tenantGym) return next();

  const gymId =
    req.params.gymId ||
    req.body.gym ||
    req.query.gymId ||
    req.query.gym;

  if (gymId && String(tenantGym) !== gymId.toString()) {
    // Log the violation (non-blocking)
    await ActivityLog.create({
      user:     req.user._id,
      userName: req.user.name,
      role:     req.user.role,
      action:   "CROSS_TENANT_ATTEMPT",
      module:   "Security",
      details:  `Cross-tenant access attempt: user gym=${tenantGym}, requested gym=${gymId}`,
      ip:       req.ip,
      status:   "failed",
    }).catch(() => {});

    return next(new AppError("Access denied. You can only manage your own gym.", 403));
  }

  next();
});
