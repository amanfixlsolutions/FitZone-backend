const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Personal Info
  name:             { type: String, required: true, trim: true },
  email:            { type: String, required: true, lowercase: true, trim: true },
  phone:            { type: String, required: true },
  age:              { type: Number, default: null },
  gender:           { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
  address:          { type: String, default: "" },
  emergencyContact: { type: String, default: "" },
  notes:            { type: String, default: "" },
  photo:            { type: String, default: "" },

  // Membership
  plan:       { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
  planName:   { type: String, default: "" },
  planPrice:  { type: Number, default: 0 },
  joinDate:   { type: Date, default: Date.now },
  expiryDate: { type: Date, default: null },
  status:     { type: String, enum: ["Active", "Paused", "Expired", "Banned"], default: "Active" },

  // Stats
  totalCheckins: { type: Number, default: 0 },
  lastCheckin:   { type: Date, default: null },

  // QR Code
  qrCode: { type: String, default: "" },
  qrId:   { type: String, unique: true, sparse: true },
}, { timestamps: true });

memberSchema.index({ gym: 1, status: 1 });
memberSchema.index({ email: 1, gym: 1 });

module.exports = mongoose.model("Member", memberSchema);
