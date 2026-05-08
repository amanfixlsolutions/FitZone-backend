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
  createGymSubscriptionOrder,
  verifyGymSubscription,
  getGymSubscriptionStatus,
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

// ── Razorpay — allow any logged-in user (members buy plans) ────────
router.post("/create-order",    createRazorpayOrder);
router.post("/verify-razorpay", verifyRazorpay);

// ── Stripe ─────────────────────────────────────────────────────────
router.post("/create-stripe-intent", createStripeIntent);
router.post("/confirm-stripe",       confirmStripe);

// ── Manual/Cash — admin only ───────────────────────────────────────
router.post("/manual", adminOrSuperAdmin, createManualPayment);

// ── Gym Platform Subscription (gym-owner pays FitZone) ────────────
router.get("/gym-subscription/status",       getGymSubscriptionStatus);
router.post("/gym-subscription/create-order",createGymSubscriptionOrder);
router.post("/gym-subscription/verify",      verifyGymSubscription);

module.exports = router;
