const express = require("express");
const router = express.Router();
const {
  getTrainers, getTrainer, createTrainer, updateTrainer, deleteTrainer, verifyTrainer,
} = require("../controllers/trainerController");
const { protect, adminOrSuperAdmin, superAdminOnly } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

// ── Public — website visitors browse trainers ──────────────────────
router.get("/public", getTrainers);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect);

router.get("/",             adminOrSuperAdmin, tenantScope, subscriptionGuard, getTrainers);
router.get("/:id",          adminOrSuperAdmin, tenantScope, subscriptionGuard, getTrainer);
router.post("/",            adminOrSuperAdmin, tenantScope, subscriptionGuard, createTrainer);
router.put("/:id",          adminOrSuperAdmin, tenantScope, subscriptionGuard, updateTrainer);
router.delete("/:id",       adminOrSuperAdmin, tenantScope, subscriptionGuard, deleteTrainer);
router.post("/:id/verify",  superAdminOnly, verifyTrainer);

module.exports = router;
