const mongoose = require("mongoose");

const promoSchema = new mongoose.Schema({
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: "" },

  discountType:  { type: String, enum: ["percentage", "fixed"], default: "percentage" },
  discountValue: { type: Number, required: true },

  minAmount:  { type: Number, default: 0 },
  maxDiscount:{ type: Number, default: null },

  usageLimit: { type: Number, default: null },
  usedCount:  { type: Number, default: 0 },

  validFrom:  { type: Date, default: Date.now },
  validUntil: { type: Date, required: true },

  active:     { type: Boolean, default: true },
  applicablePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: "Plan" }],
}, { timestamps: true });

// code already has unique:true on field — no separate index needed
promoSchema.index({ active: 1, validUntil: 1 });

module.exports = mongoose.model("Promo", promoSchema);
