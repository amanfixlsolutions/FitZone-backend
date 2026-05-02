const express = require("express");
const router = express.Router();
const { getLogs, clearLogs } = require("../controllers/logController");
const { protect, superAdminOnly, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/",       getLogs);
router.delete("/",    superAdminOnly, clearLogs);

module.exports = router;
