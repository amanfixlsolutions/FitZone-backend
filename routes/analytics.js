const express = require("express");
const router = express.Router();
const { getSuperAdminDashboard, getGymOwnerDashboard } = require("../controllers/analyticsController");
const { protect, superAdminOnly, gymOwnerOnly, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect);

router.get("/super-admin", superAdminOnly, getSuperAdminDashboard);
router.get("/gym-owner",   gymOwnerOnly,   getGymOwnerDashboard);

module.exports = router;
