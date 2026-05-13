const express = require("express");
const router = express.Router();
const {
  getNotifications, broadcast, markRead, markAllRead, deleteNotification,
} = require("../controllers/notificationController");
const { protect, superAdminOnly } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

// All notification routes require login — any role (member, gym-owner, super-admin)
router.use(protect, tenantScope, subscriptionGuard);

router.get("/",             getNotifications);
router.patch("/read-all",   markAllRead);
router.patch("/:id/read",   markRead);
router.delete("/:id",       deleteNotification);

// Broadcast only for super-admin
router.post("/broadcast",   superAdminOnly, broadcast);

module.exports = router;
