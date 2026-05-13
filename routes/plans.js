const express = require("express");
const router = express.Router();
const { getPlans, getPlan, createPlan, updatePlan, deletePlan, togglePlan } = require("../controllers/planController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

// ── Public — website visitors browse plans ─────────────────────────
router.get("/public", getPlans);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect, adminOrSuperAdmin, tenantScope, subscriptionGuard);

router.get("/",              getPlans);
router.get("/:id",           getPlan);
router.post("/",             createPlan);
router.put("/:id",           updatePlan);
router.patch("/:id/toggle",  togglePlan);
router.delete("/:id",        deletePlan);

module.exports = router;
