const express = require("express");
const router = express.Router();
const { getSuperAdminDashboard, getGymOwnerDashboard } = require("../controllers/analyticsController");
const { protect, superAdminOnly, gymOwnerOnly, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

router.use(protect);

router.get("/super-admin", superAdminOnly, getSuperAdminDashboard);
router.get("/gym-owner",   gymOwnerOnly, tenantScope, subscriptionGuard, getGymOwnerDashboard);

module.exports = router;
