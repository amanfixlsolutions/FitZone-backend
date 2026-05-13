const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  gym:    { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  plan:   { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },

  invoiceNumber: { type: String, unique: true, required: true },
  memberName:    { type: String, required: true },
  memberEmail:   { type: String, required: true },
  gymName:       { type: String, required: true },
  planName:      { type: String, default: "" },

  items: [{
    description: { type: String, required: true },
    quantity:    { type: Number, default: 1 },
    unitPrice:   { type: Number, required: true },
    total:       { type: Number, required: true },
  }],

  subtotal: { type: Number, required: true },
  tax:      { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total:    { type: Number, required: true },
  currency: { type: String, default: "INR" },

  status:  { type: String, enum: ["Draft", "Sent", "Paid", "Overdue", "Cancelled"], default: "Draft" },
  dueDate: { type: Date, default: null },
  paidAt:  { type: Date, default: null },

  notes: { type: String, default: "" },

  // ── SaaS additions ─────────────────────────────────────────────
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
}, { timestamps: true });

invoiceSchema.index({ gym: 1, status: 1 });
invoiceSchema.index({ member: 1 });
// invoiceNumber already has unique:true on field — no separate index needed

module.exports = mongoose.model("Invoice", invoiceSchema);
