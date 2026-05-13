const express = require("express");
const router = express.Router();
const { getAttendance, checkIn, checkOut, getAttendanceStats, qrCheckin } = require("../controllers/attendanceController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

// ── Public route — no auth (member scans QR and enters phone) ─────
router.post("/qr-checkin", qrCheckin);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect, adminOrSuperAdmin, tenantScope, subscriptionGuard);

router.get("/stats",    getAttendanceStats);
router.get("/",         getAttendance);
router.post("/checkin", checkIn);
router.post("/checkout",checkOut);

module.exports = router;
