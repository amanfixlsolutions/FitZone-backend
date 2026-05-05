const express = require("express");
const router  = express.Router();
const {
  getLiveClasses, getLiveClass, createLiveClass, updateLiveClass, deleteLiveClass,
  startLiveClass, completeLiveClass, cancelLiveClass, getClassBookings,
  getUpcomingClasses, bookClass, verifyPayment, joinClass,
  getMemberHistory, getMemberSpending, getAnalytics, regenerateZoom,
} = require("../controllers/liveClassController");
const { protect, gymOwnerOnly, adminOrSuperAdmin } = require("../middleware/auth");
const zoomService = require("../services/zoomService");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Public — members browse upcoming classes ───────────────────────
router.get("/upcoming", getUpcomingClasses);

// ── Zoom connection test (admin only) ─────────────────────────────
router.get("/zoom-test", protect, adminOrSuperAdmin, asyncHandler(async (req, res) => {
  if (!zoomService.isConfigured()) {
    return res.json({
      success: false,
      message: "Zoom credentials not set in environment variables.",
      env: {
        ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID ? "✓ set" : "✗ missing",
        ZOOM_CLIENT_ID:  process.env.ZOOM_CLIENT_ID  ? "✓ set" : "✗ missing",
        ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET ? "✓ set" : "✗ missing",
      }
    });
  }
  try {
    const result = await zoomService.testConnection();
    res.json({ success: true, message: "Zoom connected!", data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}));

// ── Public Zoom debug (no auth — remove after fixing) ─────────────
router.get("/zoom-debug", asyncHandler(async (req, res) => {
  const env = {
    ZOOM_ACCOUNT_ID:    process.env.ZOOM_ACCOUNT_ID    ? `✓ (${process.env.ZOOM_ACCOUNT_ID.slice(0,6)}...)` : "✗ MISSING",
    ZOOM_CLIENT_ID:     process.env.ZOOM_CLIENT_ID     ? `✓ (${process.env.ZOOM_CLIENT_ID.slice(0,6)}...)`  : "✗ MISSING",
    ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET ? `✓ set` : "✗ MISSING",
    isConfigured:       zoomService.isConfigured(),
  };

  if (!zoomService.isConfigured()) {
    return res.json({ success: false, env, message: "Zoom not configured on this server" });
  }

  try {
    const result = await zoomService.testConnection();
    res.json({ success: true, env, zoom: result });
  } catch (err) {
    res.json({ success: false, env, error: err.message });
  }
}));

// ── Protected routes ───────────────────────────────────────────────
router.use(protect);

// ── Member routes ──────────────────────────────────────────────────
router.get("/member/history",      getMemberHistory);
router.get("/member/spending",     getMemberSpending);
router.post("/:id/book",           bookClass);
router.post("/:id/verify-payment", verifyPayment);
router.post("/:id/join",           joinClass);

// ── Gym Owner only — live class management ─────────────────────────
router.post("/",                        gymOwnerOnly, createLiveClass);
router.put("/:id",                      gymOwnerOnly, updateLiveClass);
router.delete("/:id",                   gymOwnerOnly, deleteLiveClass);
router.post("/:id/start",               gymOwnerOnly, startLiveClass);
router.post("/:id/complete",            gymOwnerOnly, completeLiveClass);
router.post("/:id/cancel",              gymOwnerOnly, cancelLiveClass);
router.post("/:id/regenerate-zoom",     gymOwnerOnly, regenerateZoom);
router.get("/:id/bookings",             gymOwnerOnly, getClassBookings);

// ── Gym Owner + Super Admin — read access ──────────────────────────
router.get("/analytics",                adminOrSuperAdmin, getAnalytics);
router.get("/",                         adminOrSuperAdmin, getLiveClasses);
// /:id GET must be last to avoid swallowing other GET routes
router.get("/:id",                      adminOrSuperAdmin, getLiveClass);

module.exports = router;
