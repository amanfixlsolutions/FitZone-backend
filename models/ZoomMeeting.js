const mongoose = require("mongoose");

const zoomMeetingSchema = new mongoose.Schema({
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  class:   { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
  trainer: { type: mongoose.Schema.Types.ObjectId, ref: "Trainer", default: null },
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  topic:       { type: String, required: true },
  agenda:      { type: String, default: "" },
  zoomMeetingId:{ type: String, required: true, unique: true },
  hostEmail:   { type: String, required: true },

  startTime:   { type: Date, required: true },
  duration:    { type: Number, required: true },

  joinUrl:     { type: String, required: true },
  startUrl:    { type: String, required: true },
  password:    { type: String, default: "" },

  status: {
    type: String,
    enum: ["scheduled", "started", "ended", "cancelled"],
    default: "scheduled",
  },

  // Participants
  registeredMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Member" }],
  attendedCount:     { type: Number, default: 0 },

  recordingUrl: { type: String, default: "" },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

zoomMeetingSchema.index({ gym: 1, startTime: -1 });
// zoomMeetingId already has unique:true on field — no separate index needed

module.exports = mongoose.model("ZoomMeeting", zoomMeetingSchema);
