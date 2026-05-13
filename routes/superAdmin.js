const express = require("express");
const router = express.Router();
const { protect, superAdminOnly } = require("../middleware/auth");
const {
  getPlatformMetrics,
  getTenants,
  getTenantDetail,
  suspendTenant,
  reactivateTenant,
  extendTrial,
  updateFeatureFlags,
  broadcastNotification,
  getRevenueBreakdown,
  getActivityFeed,
  getTenantHealth,
} = require("../controllers/superAdminController");

// ── All routes require super-admin authentication ──────────────────
router.use(protect, superAdminOnly);

// ── Platform Metrics ───────────────────────────────────────────────
router.get("/metrics", getPlatformMetrics);

// ── Tenant Management ──────────────────────────────────────────────
router.get("/tenants", getTenants);
router.get("/tenants/:id", getTenantDetail);
router.post("/tenants/:id/suspend", suspendTenant);
router.post("/tenants/:id/reactivate", reactivateTenant);
router.post("/tenants/:id/extend-trial", extendTrial);
router.put("/tenants/:id/feature-flags", updateFeatureFlags);

// ── Communication ──────────────────────────────────────────────────
router.post("/broadcast", broadcastNotification);

// ── Revenue & Analytics ────────────────────────────────────────────
router.get("/revenue", getRevenueBreakdown);
router.get("/activity", getActivityFeed);
router.get("/health", getTenantHealth);

module.exports = router;
