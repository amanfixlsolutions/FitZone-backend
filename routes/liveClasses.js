const express = require("express");
const router  = express.Router();
const {
  getLiveClasses, getLiveClass, createLiveClass, updateLiveClass, deleteLiveClass,
  startLiveClass, completeLiveClass, cancelLiveClass, getClassBookings,
  getUpcomingClasses, bookClass, verifyPayment, joinClass,
  getMemberHistory, getMemberSpending, getAnalytics, regenerateZoom,
} = require("../controllers/liveClassController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");
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

// ── All protected routes require login ─────────────────────────────
router.use(protect);

// ── Who am I — debug current user role ────────────────────────────
router.get("/whoami", (req, res) => {
  res.json({
    success: true,
    user: {
      id:    req.user._id,
      name:  req.user.name,
      email: req.user.email,
      role:  req.user.role,
      gym:   req.user.gym,
    },
  });
});

// ── Member routes ──────────────────────────────────────────────────
router.get("/member/history",      getMemberHistory);
router.get("/member/spending",     getMemberSpending);
router.post("/:id/book",           bookClass);
router.post("/:id/verify-payment", verifyPayment);
router.post("/:id/join",           joinClass);

// ── Gym Owner + Super Admin — management ──────────────────────────
// Using adminOrSuperAdmin (gym-owner OR super-admin) for all management
router.get("/analytics",                adminOrSuperAdmin, getAnalytics);
router.get("/",                         adminOrSuperAdmin, getLiveClasses);
router.post("/",                        adminOrSuperAdmin, createLiveClass);
router.put("/:id",                      adminOrSuperAdmin, updateLiveClass);
router.delete("/:id",                   adminOrSuperAdmin, deleteLiveClass);
router.post("/:id/start",               adminOrSuperAdmin, startLiveClass);
router.post("/:id/complete",            adminOrSuperAdmin, completeLiveClass);
router.post("/:id/cancel",              adminOrSuperAdmin, cancelLiveClass);
router.post("/:id/regenerate-zoom",     adminOrSuperAdmin, regenerateZoom);
router.get("/:id/bookings",             adminOrSuperAdmin, getClassBookings);
// /:id GET last — prevents shadowing specific routes above
router.get("/:id",                      adminOrSuperAdmin, getLiveClass);

module.exports = router;
