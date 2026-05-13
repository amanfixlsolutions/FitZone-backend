const express = require("express");
const router  = express.Router();
const {
  getLiveClasses, getLiveClass, createLiveClass, updateLiveClass, deleteLiveClass,
  startLiveClass, completeLiveClass, cancelLiveClass, getClassBookings,
  getUpcomingClasses, bookClass, verifyPayment, joinClass,
  getMemberHistory, getMemberSpending, getAnalytics, regenerateZoom,
} = require("../controllers/liveClassController");
const { protect } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");
const zoomService = require("../services/zoomService");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Public — no auth ───────────────────────────────────────────────
router.get("/upcoming",    getUpcomingClasses);

// ── Public debug — check Zoom config ──────────────────────────────
router.get("/zoom-debug", asyncHandler(async (req, res) => {
  const env = {
    ZOOM_ACCOUNT_ID:    process.env.ZOOM_ACCOUNT_ID    ? `✓ (${process.env.ZOOM_ACCOUNT_ID.slice(0,6)}...)` : "✗ MISSING",
    ZOOM_CLIENT_ID:     process.env.ZOOM_CLIENT_ID     ? `✓ (${process.env.ZOOM_CLIENT_ID.slice(0,6)}...)`  : "✗ MISSING",
    ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET ? "✓ set" : "✗ MISSING",
    isConfigured:       zoomService.isConfigured(),
  };
  if (!zoomService.isConfigured()) {
    return res.json({ success: false, env, message: "Zoom not configured" });
  }
  try {
    const result = await zoomService.testConnection();
    res.json({ success: true, env, zoom: result });
  } catch (err) {
    res.json({ success: false, env, error: err.message });
  }
}));

// ── All routes below require login only (no role check here) ───────
// Role/ownership checks are done inside each controller
router.use(protect);

// ── Debug: who am I ────────────────────────────────────────────────
router.get("/whoami", (req, res) => {
  res.json({
    success: true,
    user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, gym: req.user.gym },
  });
});

// ── Member routes ──────────────────────────────────────────────────
router.get("/member/history",      getMemberHistory);
router.get("/member/spending",     getMemberSpending);
router.post("/:id/book",           bookClass);
router.post("/:id/verify-payment", verifyPayment);
router.post("/:id/join",           joinClass);

// ── Management routes — ownership checked inside controller ────────
router.get("/analytics",                tenantScope, subscriptionGuard, getAnalytics);
router.get("/",                         tenantScope, subscriptionGuard, getLiveClasses);
router.post("/",                        tenantScope, subscriptionGuard, createLiveClass);
router.put("/:id",                      tenantScope, subscriptionGuard, updateLiveClass);
router.delete("/:id",                   tenantScope, subscriptionGuard, deleteLiveClass);
router.post("/:id/start",               tenantScope, subscriptionGuard, startLiveClass);
router.post("/:id/complete",            tenantScope, subscriptionGuard, completeLiveClass);
router.post("/:id/cancel",              tenantScope, subscriptionGuard, cancelLiveClass);
router.post("/:id/regenerate-zoom",     tenantScope, subscriptionGuard, regenerateZoom);
router.get("/:id/bookings",             tenantScope, subscriptionGuard, getClassBookings);
// /:id GET last — prevents shadowing specific routes above
router.get("/:id",                      getLiveClass);

module.exports = router;
