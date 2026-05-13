const mongoose = require("mongoose");

const tenantConfigSchema = new mongoose.Schema({
  // ── Ownership ──────────────────────────────────────────────────
  gym: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Gym",
    required: true,
    unique: true,
  },

  // ── Feature Flags ──────────────────────────────────────────────
  featureFlags: {
    member_self_registration: { type: Boolean, default: false },
    live_classes:             { type: Boolean, default: false },
    zoom_integration:         { type: Boolean, default: false },
    campaigns:                { type: Boolean, default: false },
    inventory:                { type: Boolean, default: false },
    analytics_advanced:       { type: Boolean, default: false },
    api_access:               { type: Boolean, default: false },
  },

  // ── Plan Limits ────────────────────────────────────────────────
  limits: {
    maxMembers:  { type: Number, default: 100 },
    maxTrainers: { type: Number, default: 10 },
    storageGB:   { type: Number, default: 5 },
  },

  // ── Branding ───────────────────────────────────────────────────
  branding: {
    primaryColor: { type: String, default: "" },
    logoUrl:      { type: String, default: "" },
    customDomain: { type: String, default: "" },
  },

  // ── Notification Preferences ───────────────────────────────────
  notifications: {
    memberExpiry:    { type: Boolean, default: true },
    paymentReceived: { type: Boolean, default: true },
    lowStock:        { type: Boolean, default: true },
  },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────
tenantConfigSchema.index({ gym: 1 }, { unique: true });

module.exports = mongoose.model("TenantConfig", tenantConfigSchema);
