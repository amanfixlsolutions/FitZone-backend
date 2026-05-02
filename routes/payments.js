const express = require("express");
const router = express.Router();
const {
  getPayments,
  createRazorpayOrder,
  verifyRazorpay,
  createStripeIntent,
  confirmStripe,
  createManualPayment,
  stripeWebhook,
  getRevenueStats,
} = require("../controllers/paymentController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

// ── Stripe webhook (raw body needed) ──────────────────────────────
router.post("/stripe-webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

router.use(protect);

// ── Revenue stats ──────────────────────────────────────────────────
router.get("/revenue", adminOrSuperAdmin, getRevenueStats);

// ── List payments ──────────────────────────────────────────────────
router.get("/", adminOrSuperAdmin, getPayments);

// ── Razorpay ───────────────────────────────────────────────────────
router.post("/create-order",    adminOrSuperAdmin, createRazorpayOrder);
router.post("/verify-razorpay", adminOrSuperAdmin, verifyRazorpay);

// ── Stripe ─────────────────────────────────────────────────────────
router.post("/create-stripe-intent", adminOrSuperAdmin, createStripeIntent);
router.post("/confirm-stripe",       adminOrSuperAdmin, confirmStripe);

// ── Manual/Cash ────────────────────────────────────────────────────
router.post("/manual", adminOrSuperAdmin, createManualPayment);

module.exports = router;
