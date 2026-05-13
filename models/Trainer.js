const mongoose = require("mongoose");

const trainerSchema = new mongoose.Schema({
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, lowercase: true, trim: true },
  phone:         { type: String, required: true },
  photo:         { type: String, default: "" },
  specialty:     { type: String, required: true },
  specialties:   [{ type: String }],
  experience:    { type: String, default: "" },
  certification: { type: String, default: "" },
  education:     { type: String, default: "" },
  bio:           { type: String, default: "" },
  salary:        { type: Number, default: 0 },

  rating:       { type: Number, default: 0, min: 0, max: 5 },
  totalRatings: { type: Number, default: 0 },
  totalSessions:{ type: Number, default: 0 },
  totalClients: { type: Number, default: 0 },

  status:    { type: String, enum: ["Active", "On Leave", "Inactive"], default: "Active" },
  available: { type: Boolean, default: true },
  verified:  { type: Boolean, default: false },

  social: {
    facebook:  { type: String, default: "" },
    instagram: { type: String, default: "" },
    twitter:   { type: String, default: "" },
  },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

trainerSchema.index({ gym: 1, status: 1 });

module.exports = mongoose.model("Trainer", trainerSchema);
