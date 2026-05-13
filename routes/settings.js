const express = require("express");
const router = express.Router();
const { getPublicSettings, submitContact, getSettings, updateSettings } = require("../controllers/settingsController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

// ── Public routes — no auth required ──────────────────────────────
router.get("/public",  getPublicSettings);
router.post("/contact", submitContact);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect, adminOrSuperAdmin, tenantScope, subscriptionGuard);

router.get("/",  getSettings);
router.put("/",  updateSettings);

module.exports = router;
