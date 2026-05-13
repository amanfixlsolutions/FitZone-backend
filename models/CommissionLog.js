const mongoose = require("mongoose");

/**
 * CommissionLog — platform commission tracking per member payment.
 * Records the platform's commission cut from each member-to-gym payment.
 */
const commissionLogSchema = new mongoose.Schema({
  // ── References ─────────────────────────────────────────────────
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym",     required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
  member:  { type: mongoose.Schema.Types.ObjectId, ref: "Member",  default: null },

  // ── Denormalized Snapshot ──────────────────────────────────────
  gymName:    { type: String, default: "" },
  memberName: { type: String, default: "" },

  // ── Financials ─────────────────────────────────────────────────
  paymentAmount:   { type: Number, default: 0 },
  commissionRate:  { type: Number, default: 0 },   // percentage, e.g. 10 = 10%
  commissionAmount:{ type: Number, default: 0 },   // platform's cut
  netAmount:       { type: Number, default: 0 },   // gym's net (paymentAmount - commissionAmount)

  // ── Timestamp ──────────────────────────────────────────────────
  paidAt: { type: Date, default: null },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────
commissionLogSchema.index({ gym: 1, createdAt: -1 });
commissionLogSchema.index({ gym: 1, paidAt: -1 });
commissionLogSchema.index({ payment: 1 });

module.exports = mongoose.model("CommissionLog", commissionLogSchema);
