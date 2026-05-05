const express = require("express");
const router = express.Router();
const {
  getPublicClasses,
  getClasses, getClass, createClass, updateClass, deleteClass,
  enrollMember, unenrollMember, getTodayClasses,
} = require("../controllers/classController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

// ── Public — no auth required ──────────────────────────────────────
router.get("/public", getPublicClasses);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect, adminOrSuperAdmin);

router.get("/today",           getTodayClasses);
router.get("/",                getClasses);
router.get("/:id",             getClass);
router.post("/",               createClass);
router.put("/:id",             updateClass);
router.delete("/:id",          deleteClass);
router.post("/:id/enroll",     enrollMember);
router.post("/:id/unenroll",   unenrollMember);

module.exports = router;
