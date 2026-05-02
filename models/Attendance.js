const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  gym:    { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },

  memberName: { type: String, required: true },
  memberPlan: { type: String, default: "" },

  // Check-in details
  checkInTime:  { type: Date, default: Date.now },
  checkOutTime: { type: Date, default: null },

  type: {
    type: String,
    enum: ["Gym Access", "Class", "Personal Training"],
    default: "Gym Access",
  },

  // If class attendance
  class:     { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
  className: { type: String, default: "" },

  // Check-in method
  method: {
    type: String,
    enum: ["QR", "Manual", "App"],
    default: "Manual",
  },

  status: { type: String, enum: ["In", "Out"], default: "In" },

  // Duration in minutes (calculated on checkout)
  duration: { type: Number, default: null },

  date: { type: String, default: () => new Date().toISOString().split("T")[0] },
}, { timestamps: true });

attendanceSchema.index({ gym: 1, date: 1 });
attendanceSchema.index({ member: 1, date: 1 });
attendanceSchema.index({ checkInTime: -1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
