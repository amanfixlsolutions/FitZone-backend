const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  title:    { type: String, required: true, trim: true },
  message:  { type: String, required: true },
  target:   {
    type: String,
    enum: ["All Members", "Active Members", "Expiring Soon", "Inactive Members", "New Members"],
    default: "All Members",
  },
  channel:  {
    type: String,
    enum: ["Email", "SMS", "WhatsApp", "In-App", "All Channels"],
    default: "Email",
  },
  status:   { type: String, enum: ["Draft", "Sent", "Scheduled", "Failed"], default: "Draft" },

  // Stats
  sentCount:   { type: Number, default: 0 },
  openedCount: { type: Number, default: 0 },
  clickCount:  { type: Number, default: 0 },

  scheduledAt: { type: Date, default: null },
  sentAt:      { type: Date, default: null },
}, { timestamps: true });

campaignSchema.index({ gym: 1, status: 1 });
campaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Campaign", campaignSchema);
