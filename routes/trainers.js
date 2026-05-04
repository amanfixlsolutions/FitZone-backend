const express = require("express");
const router = express.Router();
const {
  getTrainers, getTrainer, createTrainer, updateTrainer, deleteTrainer, verifyTrainer,
} = require("../controllers/trainerController");
const { protect, adminOrSuperAdmin, superAdminOnly } = require("../middleware/auth");

// ── Public — website visitors browse trainers ──────────────────────
router.get("/public", getTrainers);

// ── Protected routes ───────────────────────────────────────────────
router.use(protect);

router.get("/",             adminOrSuperAdmin, getTrainers);
router.get("/:id",          adminOrSuperAdmin, getTrainer);
router.post("/",            adminOrSuperAdmin, createTrainer);
router.put("/:id",          adminOrSuperAdmin, updateTrainer);
router.delete("/:id",       adminOrSuperAdmin, deleteTrainer);
router.post("/:id/verify",  superAdminOnly, verifyTrainer);

module.exports = router;
