const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  // Target: null = all, specific user = that user
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  gym:       { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  title:   { type: String, required: true },
  message: { type: String, required: true },

  type: {
    type: String,
    enum: ["member", "payment", "class", "alert", "system", "gym", "trainer"],
    default: "system",
  },

  // Audience for broadcast
  audience: {
    type: String,
    enum: ["all", "super-admin", "gym-owners", "members", "specific-gym"],
    default: "all",
  },

  channel: {
    type: String,
    enum: ["in-app", "email", "sms", "push"],
    default: "in-app",
  },

  read:    { type: Boolean, default: false },
  readAt:  { type: Date, default: null },

  // Action link
  link:    { type: String, default: "" },
  data:    { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ gym: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
