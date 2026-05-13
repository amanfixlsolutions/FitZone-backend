const express = require("express");
const router = express.Router();
const { getInvoices, getInvoice, sendInvoice } = require("../controllers/invoiceController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenantScope");
const { subscriptionGuard } = require("../middleware/subscriptionGuard");

router.use(protect, adminOrSuperAdmin, tenantScope, subscriptionGuard);

router.get("/",           getInvoices);
router.get("/:id",        getInvoice);
router.post("/:id/send",  sendInvoice);

module.exports = router;
