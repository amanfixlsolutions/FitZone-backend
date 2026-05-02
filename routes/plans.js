const express = require("express");
const router = express.Router();
const { getPlans, getPlan, createPlan, updatePlan, deletePlan, togglePlan } = require("../controllers/planController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/",              getPlans);
router.get("/:id",           getPlan);
router.post("/",             createPlan);
router.put("/:id",           updatePlan);
router.patch("/:id/toggle",  togglePlan);
router.delete("/:id",        deletePlan);

module.exports = router;
