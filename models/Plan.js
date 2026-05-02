const mongoose = require("mongoose");

const planSchema = new mongoose.Schema({
  // null = platform-wide plan (super admin), ObjectId = gym-specific plan
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  name:     { type: String, required: true, trim: true },
  price:    { type: Number, required: true, min: 0 },
  duration: { type: Number, required: true, min: 1 },
  unit:     { type: String, enum: ["Day", "Days", "Month", "Months", "Year", "Years"], default: "Months" },

  features: [{ type: String }],
  color:    { type: String, default: "blue" },
  popular:  { type: Boolean, default: false },
  active:   { type: Boolean, default: true },

  // Stats
  totalSubscribers: { type: Number, default: 0 },
  activeSubscribers:{ type: Number, default: 0 },

  // Discount
  yearlyDiscount: { type: Number, default: 20 },
}, { timestamps: true });

planSchema.index({ gym: 1, active: 1 });

module.exports = mongoose.model("Plan", planSchema);
