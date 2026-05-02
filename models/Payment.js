const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  gym:    { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  plan:   { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },

  memberName: { type: String, required: true },
  planName:   { type: String, default: "" },
  gymName:    { type: String, default: "" },

  amount:   { type: Number, required: true },
  currency: { type: String, default: "INR" },

  type:   { type: String, enum: ["Payment", "Refund", "Commission"], default: "Payment" },
  status: { type: String, enum: ["Success", "Pending", "Failed", "Refunded"], default: "Pending" },

  // Payment gateway
  gateway:         { type: String, enum: ["Stripe", "Razorpay", "Cash", "UPI", "Manual"], default: "Manual" },
  gatewayPaymentId:{ type: String, default: "" },
  gatewayOrderId:  { type: String, default: "" },

  // Commission (platform fee)
  commissionRate:  { type: Number, default: 0 },
  commissionAmount:{ type: Number, default: 0 },
  netAmount:       { type: Number, default: 0 },

  description: { type: String, default: "" },
  invoiceId:   { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },

  paidAt: { type: Date, default: null },
}, { timestamps: true });

paymentSchema.index({ gym: 1, status: 1 });
paymentSchema.index({ member: 1 });
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
