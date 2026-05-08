const express = require("express");
const router = express.Router();
const {
  getGyms, getGym, createGym, updateGym, deleteGym,
  approveGym, rejectGym, suspendGym, getGymStats,
  createGymWithOwner, getPublicGyms,
} = require("../controllers/gymController");
const { protect, superAdminOnly, adminOrSuperAdmin } = require("../middleware/auth");

// ── Public route (no auth) ─────────────────────────────────────────
router.get("/public", getPublicGyms);

router.use(protect);

router.get("/stats",              superAdminOnly, getGymStats);
router.post("/create-with-owner", superAdminOnly, createGymWithOwner);
router.get("/",                   superAdminOnly, getGyms);
router.get("/:id",                adminOrSuperAdmin, getGym);
router.post("/",                  createGym);
router.put("/:id",                adminOrSuperAdmin, updateGym);
router.delete("/:id",             superAdminOnly, deleteGym);
router.post("/:id/approve",       superAdminOnly, approveGym);
router.post("/:id/reject",        superAdminOnly, rejectGym);
router.post("/:id/suspend",       superAdminOnly, suspendGym);

module.exports = router;
