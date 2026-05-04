const mongoose = require("mongoose");

/**
 * LiveClassBooking — tracks member bookings for live classes.
 * Links Member → LiveClass with payment and attendance tracking.
 */
const liveClassBookingSchema = new mongoose.Schema({
  // ── References ─────────────────────────────────────────────────
  member:    { type: mongoose.Schema.Types.ObjectId, ref: "Member",    required: true },
  gym:       { type: mongoose.Schema.Types.ObjectId, ref: "Gym",       required: true },
  liveClass: { type: mongoose.Schema.Types.ObjectId, ref: "LiveClass", required: true },

  // ── Snapshot fields (denormalized for reports) ─────────────────
  memberName:  { type: String, required: true },
  memberEmail: { type: String, default: "" },
  classTitle:  { type: String, required: true },
  gymName:     { type: String, default: "" },

  // ── Payment ────────────────────────────────────────────────────
  paymentId:     { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
  paymentAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: "free" },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "refunded", "free"],
    default: "free",
  },

  // ── Razorpay order tracking ────────────────────────────────────
  razorpayOrderId:   { type: String, default: "" },
  razorpayPaymentId: { type: String, default: "" },

  // ── Booking Status ─────────────────────────────────────────────
  bookingStatus: {
    type: String,
    enum: ["pending", "confirmed", "cancelled"],
    default: "confirmed",
  },

  // ── Attendance ─────────────────────────────────────────────────
  attendanceStatus: {
    type: String,
    enum: ["not_joined", "joined", "completed", "absent"],
    default: "not_joined",
  },

  // ── Timestamps ─────────────────────────────────────────────────
  bookedAt:    { type: Date, default: Date.now },
  joinedAt:    { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

// ── Prevent duplicate bookings ─────────────────────────────────────
liveClassBookingSchema.index({ member: 1, liveClass: 1 }, { unique: true });

// ── Performance indexes ────────────────────────────────────────────
liveClassBookingSchema.index({ liveClass: 1, bookingStatus: 1 });
liveClassBookingSchema.index({ member: 1, bookedAt: -1 });
liveClassBookingSchema.index({ gym: 1, bookedAt: -1 });
liveClassBookingSchema.index({ member: 1, attendanceStatus: 1 });
liveClassBookingSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model("LiveClassBooking", liveClassBookingSchema);
