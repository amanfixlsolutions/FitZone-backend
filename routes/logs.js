const express = require("express");
const router = express.Router();
const { getLogs, clearLogs } = require("../controllers/logController");
const { protect, superAdminOnly, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

router.use(protect, adminOrSuperAdmin, tenantScope, subscriptionGuard);

router.get("/",       getLogs);
router.delete("/",    superAdminOnly, clearLogs);

module.exports = router;
