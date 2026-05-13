const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  gym:    { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },

  reviewerName:  { type: String, required: true },
  reviewerEmail: { type: String, default: "" },
  rating:        { type: Number, required: true, min: 1, max: 5 },
  title:         { type: String, default: "" },
  content:       { type: String, required: true },

  status: {
    type: String,
    enum: ["pending", "approved", "flagged", "rejected"],
    default: "pending",
  },

  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  moderatedAt: { type: Date, default: null },
  flagReason:  { type: String, default: "" },

  helpful: { type: Number, default: 0 },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

reviewSchema.index({ gym: 1, status: 1 });
reviewSchema.index({ rating: -1 });

module.exports = mongoose.model("Review", reviewSchema);
