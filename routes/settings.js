const express = require("express");
const router = express.Router();
const { getPublicSettings, submitContact, getSettings, updateSettings } = require("../controllers/settingsController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

// ── Public routes — no auth required ──────────────────────────────
router.get("/public",  getPublicSettings);
router.post("/contact", submitContact);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect, adminOrSuperAdmin);

router.get("/",  getSettings);
router.put("/",  updateSettings);

module.exports = router;
