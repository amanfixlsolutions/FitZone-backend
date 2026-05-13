const mongoose = require("mongoose");

/**
 * PlatformInvoice — gym-to-platform SaaS payment invoices.
 * Tracks subscription payments made by gyms to the FitZone platform.
 */
const platformInvoiceSchema = new mongoose.Schema({
  // ── Gym Reference ──────────────────────────────────────────────
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  gymName: { type: String, default: "" },

  // ── Invoice Identity ───────────────────────────────────────────
  invoiceNumber: { type: String, unique: true, required: true },

  // ── Subscription Details ───────────────────────────────────────
  tier: {
    type: String,
    enum: ["starter", "growth", "enterprise"],
    required: true,
  },
  billingCycle: {
    type: String,
    enum: ["monthly", "yearly"],
    required: true,
  },

  // ── Financials ─────────────────────────────────────────────────
  amount:   { type: Number, required: true },
  currency: { type: String, default: "INR" },

  // ── Status ─────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ["paid", "pending", "failed"],
    default: "pending",
  },

  // ── Payment Gateway ────────────────────────────────────────────
  gateway: {
    type: String,
    enum: ["Razorpay", "Stripe"],
    default: null,
  },
  gatewayPaymentId: { type: String, default: "" },

  // ── Billing Period ─────────────────────────────────────────────
  periodStart: { type: Date, default: null },
  periodEnd:   { type: Date, default: null },

  // ── Payment Timestamp ──────────────────────────────────────────
  paidAt: { type: Date, default: null },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────
platformInvoiceSchema.index({ gym: 1, createdAt: -1 });
platformInvoiceSchema.index({ gym: 1, status: 1 });
platformInvoiceSchema.index({ status: 1 });
// invoiceNumber already has unique:true on field — no separate index needed

module.exports = mongoose.model("PlatformInvoice", platformInvoiceSchema);
