const mongoose = require("mongoose");

const gymSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ownerName:   { type: String, required: true },
  email:       { type: String, required: true, lowercase: true },
  phone:       { type: String, default: "" },
  city:        { type: String, required: true },
  address:     { type: String, default: "" },
  description: { type: String, default: "" },
  logo:        { type: String, default: "" },
  images:      [{ type: String }],

  status: {
    type: String,
    enum: ["pending", "active", "suspended", "rejected"],
    default: "pending",
  },

  // Financials
  commissionRate: { type: Number, default: 10 },
  totalRevenue:   { type: Number, default: 0 },
  monthlyRevenue: { type: Number, default: 0 },

  // Stats
  totalMembers:   { type: Number, default: 0 },
  activeMembers:  { type: Number, default: 0 },
  rating:         { type: Number, default: 0, min: 0, max: 5 },
  totalRatings:   { type: Number, default: 0 },

  // Documents
  docs: {
    submitted:  { type: Boolean, default: false },
    verified:   { type: Boolean, default: false },
    files:      [{ type: String }],
  },

  // Settings
  openingHours: {
    weekdays: { open: { type: String, default: "05:30" }, close: { type: String, default: "23:00" } },
    saturday: { open: { type: String, default: "06:00" }, close: { type: String, default: "22:00" } },
    sunday:   { open: { type: String, default: "07:00" }, close: { type: String, default: "21:00" } },
  },

  approvedAt:  { type: Date, default: null },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rejectedAt:  { type: Date, default: null },
  rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rejectReason:{ type: String, default: "" },

  // ── Platform subscription (gym pays FitZone to stay active) ───
  subscription: {
    plan:       { type: String, enum: ["Basic", "Professional", "Enterprise"], default: "Basic" },
    status:     { type: String, enum: ["trial", "active", "expired", "cancelled"], default: "trial" },
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    startDate:  { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    autoRenew:  { type: Boolean, default: true },
    lastPaymentId:    { type: String, default: "" },
    lastPaymentAmount:{ type: Number, default: 0 },
    lastPaidAt:       { type: Date, default: null },
    // ── SaaS lifecycle additions ─────────────────────────────────
    trialStartedAt:    { type: Date, default: null },
    gracePeriodEndsAt: { type: Date, default: null },
    dunningStep:       { type: Number, default: 0 },
  },

  // ── SaaS Tier & Limits ─────────────────────────────────────────
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  subscriptionTier: {
    type: String,
    enum: ["starter", "growth", "enterprise"],
    default: "starter",
  },
  trialEndsAt: { type: Date, default: null },
  featureFlags: { type: mongoose.Schema.Types.Mixed, default: {} },
  maxMembers:  { type: Number, default: 100 },
  maxTrainers: { type: Number, default: 10 },
}, { timestamps: true });

gymSchema.index({ status: 1 });
gymSchema.index({ owner: 1 });
gymSchema.index({ city: 1 });

module.exports = mongoose.model("Gym", gymSchema);
