const express = require("express");
const router = express.Router();
const {
  getNotifications, broadcast, markRead, markAllRead, deleteNotification,
} = require("../controllers/notificationController");
const { protect, adminOrSuperAdmin, superAdminOnly } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/",                  getNotifications);
router.post("/broadcast",        superAdminOnly, broadcast);
router.patch("/read-all",        markAllRead);
router.patch("/:id/read",        markRead);
router.delete("/:id",            deleteNotification);

module.exports = router;
