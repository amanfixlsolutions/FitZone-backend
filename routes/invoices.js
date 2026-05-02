const express = require("express");
const router = express.Router();
const { getInvoices, getInvoice, sendInvoice } = require("../controllers/invoiceController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/",           getInvoices);
router.get("/:id",        getInvoice);
router.post("/:id/send",  sendInvoice);

module.exports = router;
