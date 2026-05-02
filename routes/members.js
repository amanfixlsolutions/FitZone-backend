const express = require("express");
const router = express.Router();
const {
  getMembers, getMember, createMember, updateMember, deleteMember,
  banMember, unbanMember, getMemberQR, getMemberStats,
} = require("../controllers/memberController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/stats",       getMemberStats);
router.get("/",            getMembers);
router.get("/:id",         getMember);
router.get("/:id/qr",      getMemberQR);
router.post("/",           createMember);
router.put("/:id",         updateMember);
router.delete("/:id",      deleteMember);
router.post("/:id/ban",    banMember);
router.post("/:id/unban",  unbanMember);

module.exports = router;
