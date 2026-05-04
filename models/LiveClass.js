const mongoose = require("mongoose");

/**
 * LiveClass — extends the existing Class concept with Zoom + booking support.
 * Separate from the recurring Class model to avoid breaking existing functionality.
 */
const liveClassSchema = new mongoose.Schema({
  // ── Ownership ──────────────────────────────────────────────────
  gym:       { type: mongoose.Schema.Types.ObjectId, ref: "Gym",     required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
  trainer:   { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", default: null },
  trainerName: { type: String, default: "" },

  // ── Class Info ─────────────────────────────────────────────────
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  category: {
    type: String,
    enum: ["Yoga", "HIIT", "Zumba", "Pilates", "Strength", "Cardio", "Meditation", "CrossFit", "Other"],
    default: "Other",
  },
  thumbnail: { type: String, default: "" },

  // ── Schedule ───────────────────────────────────────────────────
  scheduledAt: { type: Date, required: true },
  duration:    { type: Number, required: true, min: 15, default: 60 }, // minutes

  // ── Capacity & Enrollment ──────────────────────────────────────
  maxParticipants: { type: Number, required: true, min: 1, default: 30 },
  enrolledCount:   { type: Number, default: 0 },

  // ── Pricing ────────────────────────────────────────────────────
  isFree: { type: Boolean, default: true },
  price:  { type: Number, default: 0, min: 0 },

  // ── Status ─────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ["draft", "scheduled", "live", "completed", "cancelled"],
    default: "scheduled",
  },

  // ── Zoom ───────────────────────────────────────────────────────
  zoomMeetingId: { type: String, default: "" },
  zoomJoinUrl:   { type: String, default: "" },
  zoomStartUrl:  { type: String, default: "" },
  zoomPassword:  { type: String, default: "" },

  // ── Timestamps ─────────────────────────────────────────────────
  startedAt:   { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason:{ type: String, default: "" },
}, { timestamps: true });

// ── Indexes for performance ────────────────────────────────────────
liveClassSchema.index({ gym: 1, status: 1 });
liveClassSchema.index({ gym: 1, scheduledAt: -1 });
liveClassSchema.index({ scheduledAt: 1 });
liveClassSchema.index({ trainer: 1 });

module.exports = mongoose.model("LiveClass", liveClassSchema);
