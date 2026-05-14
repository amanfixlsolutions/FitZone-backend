const mongoose = require("mongoose");
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

/**
 * SaaSSubscription — detailed subscription lifecycle tracking.
 * Separate from Gym.subscription sub-document — provides full audit trail.
 */
const saasSubscriptionSchema = new Schema({
  gym:     { type: ObjectId, ref: "Gym", required: true, unique: true },
  gymName: { type: String, default: "" },

  // ── Current state ──────────────────────────────────────────────
  tier: {
    type: String,
    enum: ["starter", "growth", "enterprise"],
    default: "starter",
  },
  status: {
    type: String,
    enum: ["trial", "active", "grace_period", "expired", "cancelled", "payment_failed"],
    default: "trial",
  },
  billingCycle: {
    type: String,
    enum: ["monthly", "yearly"],
    default: "monthly",
  },

  // ── Trial ──────────────────────────────────────────────────────
  trialStartedAt: { type: Date, default: null },
  trialEndsAt:    { type: Date, default: null },
  trialDays:      { type: Number, default: 14 },

  // ── Billing ────────────────────────────────────────────────────
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd:   { type: Date, default: null },
  nextBillingDate:    { type: Date, default: null },
  amount:             { type: Number, default: 0 },
  currency:           { type: String, default: "INR" },

  // ── Payment ────────────────────────────────────────────────────
  lastPaymentId:     { type: String, default: "" },
  lastPaymentAmount: { type: Number, default: 0 },
  lastPaidAt:        { type: Date, default: null },
  paymentGateway: {
    type: String,
    enum: ["Razorpay", "Stripe", ""],
    default: "",
  },

  // ── Grace period ───────────────────────────────────────────────
  gracePeriodEndsAt: { type: Date, default: null },

  // ── Dunning ────────────────────────────────────────────────────
  dunningStep:      { type: Number, default: 0 }, // 0=none, 1=day0, 2=day3, 3=day7
  dunningStartedAt: { type: Date, default: null },
  nextDunningAt:    { type: Date, default: null },

  // ── Cancellation ───────────────────────────────────────────────
  cancelledAt:  { type: Date, default: null },
  cancelReason: { type: String, default: "" },
}, { timestamps: true });

saasSubscriptionSchema.index({ gym: 1 }, { unique: true });
saasSubscriptionSchema.index({ status: 1, nextBillingDate: 1 });
saasSubscriptionSchema.index({ status: 1, trialEndsAt: 1 });

module.exports = mongoose.model("SaaSSubscription", saasSubscriptionSchema);
