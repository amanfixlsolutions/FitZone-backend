const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  gym:      { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
  userName: { type: String, default: "System" },
  role:     { type: String, default: "" },

  action:   { type: String, required: true },
  module:   { type: String, required: true },
  details:  { type: String, default: "" },
  data:     { type: mongoose.Schema.Types.Mixed, default: {} },

  ip:         { type: String, default: "" },
  userAgent:  { type: String, default: "" },
  status:     { type: String, enum: ["success", "failed", "warning"], default: "success" },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ module: 1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
