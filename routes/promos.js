const express = require("express");
const router = express.Router();
const { getPromos, createPromo, updatePromo, deletePromo, validatePromo } = require("../controllers/promoController");
const { protect, adminOrSuperAdmin, superAdminOnly } = require("../middleware/auth");

router.use(protect);

router.post("/validate",  adminOrSuperAdmin, validatePromo);
router.get("/",           adminOrSuperAdmin, getPromos);
router.post("/",          superAdminOnly, createPromo);
router.put("/:id",        superAdminOnly, updatePromo);
router.delete("/:id",     superAdminOnly, deletePromo);

module.exports = router;
