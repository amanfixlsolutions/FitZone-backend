const express = require("express");
const router  = express.Router();
const {
  getLiveClasses, getLiveClass, createLiveClass, updateLiveClass, deleteLiveClass,
  startLiveClass, completeLiveClass, cancelLiveClass, getClassBookings,
  getUpcomingClasses, bookClass, verifyPayment, joinClass,
  getMemberHistory, getMemberSpending, getAnalytics,
} = require("../controllers/liveClassController");
const { protect, gymOwnerOnly, adminOrSuperAdmin } = require("../middleware/auth");
const zoomService = require("../services/zoomService");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Public — members browse upcoming classes ───────────────────────
router.get("/upcoming", getUpcomingClasses);

// ── Zoom connection test (admin only) ─────────────────────────────
router.get("/zoom-test", protect, adminOrSuperAdmin, asyncHandler(async (req, res) => {
  if (!zoomService.isConfigured()) {
    return res.json({ success: false, message: "Zoom credentials not set in environment variables." });
  }
  try {
    const result = await zoomService.testConnection();
    res.json({ success: true, message: "Zoom connected!", data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}));

// ── Protected routes ───────────────────────────────────────────────
router.use(protect);

// ── Member routes ──────────────────────────────────────────────────
router.get("/member/history",  getMemberHistory);
router.get("/member/spending", getMemberSpending);
router.post("/:id/book",           bookClass);
router.post("/:id/verify-payment", verifyPayment);
router.post("/:id/join",           joinClass);

// ── Gym Owner / Super Admin routes ─────────────────────────────────
router.get("/analytics",       adminOrSuperAdmin, getAnalytics);
router.get("/",                adminOrSuperAdmin, getLiveClasses);
router.get("/:id",             adminOrSuperAdmin, getLiveClass);
router.post("/",               gymOwnerOnly,      createLiveClass);
router.put("/:id",             adminOrSuperAdmin, updateLiveClass);
router.delete("/:id",          adminOrSuperAdmin, deleteLiveClass);
router.post("/:id/start",      adminOrSuperAdmin, startLiveClass);
router.post("/:id/complete",   adminOrSuperAdmin, completeLiveClass);
router.post("/:id/cancel",     adminOrSuperAdmin, cancelLiveClass);
router.get("/:id/bookings",    adminOrSuperAdmin, getClassBookings);

module.exports = router;
