const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  name:        { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  trainer:     { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", required: true },
  trainerName: { type: String, required: true },

  // Schedule
  days:      [{ type: String, enum: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] }],
  startTime: { type: String, required: true },
  endTime:   { type: String, required: true },

  // Capacity
  capacity: { type: Number, required: true, min: 1 },
  enrolled: { type: Number, default: 0 },

  // Pricing
  isPaid: { type: Boolean, default: false },
  price:  { type: Number, default: 0 },

  // Level
  level: {
    type: String,
    enum: ["Beginner", "Intermediate", "Advanced", "Expert", "All Levels"],
    default: "All Levels",
  },

  // Intensity & Calories
  intensity: { type: String, default: "" },
  calories:  { type: String, default: "" },
  image:     { type: String, default: "" },

  status: { type: String, enum: ["Active", "Paused", "Cancelled"], default: "Active" },

  // Enrolled members
  enrolledMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Member" }],

  // Zoom integration
  zoomMeetingId:  { type: String, default: "" },
  zoomJoinUrl:    { type: String, default: "" },
  zoomStartUrl:   { type: String, default: "" },
  isOnline:       { type: Boolean, default: false },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

classSchema.index({ gym: 1, status: 1 });
classSchema.index({ trainer: 1 });

module.exports = mongoose.model("Class", classSchema);
