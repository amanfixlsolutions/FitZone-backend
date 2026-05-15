const express = require("express");
const router = express.Router();
const { getSuperAdminDashboard, getGymOwnerDashboard } = require("../controllers/analyticsController");
const { protect, superAdminOnly, gymOwnerOnly, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");
const { cacheMiddleware } = require("../services/cacheService");

router.use(protect);

router.get(
  "/super-admin",
  superAdminOnly,
  cacheMiddleware("analytics:super-admin", 5 * 60 * 1000),
  getSuperAdminDashboard
);

router.get(
  "/gym-owner",
  gymOwnerOnly,
  tenantScope,
  subscriptionGuard,
  cacheMiddleware((req) => `analytics:gym-owner:${req.user.gym}`, 5 * 60 * 1000),
  getGymOwnerDashboard
);

module.exports = router;
