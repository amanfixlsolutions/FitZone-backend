const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true },
  otp:       { type: String, required: true },
  type:      { type: String, enum: ["signup", "reset-password", "verify-email"], default: "signup" },
  verified:  { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // Auto-delete after expiry
}, { timestamps: true });

otpSchema.index({ email: 1, type: 1 });

module.exports = mongoose.model("OTP", otpSchema);
