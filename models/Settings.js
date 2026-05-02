const mongoose = require("mongoose");

const timingSchema = new mongoose.Schema({
  open:   { type: String, default: "06:00" },
  close:  { type: String, default: "22:00" },
  closed: { type: Boolean, default: false },
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  gym: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },

  // ── Platform settings (super admin) ───────────────────────────
  platform: {
    commissionRate:    { type: Number, default: 10 },
    maxPauseDays:      { type: Number, default: 30 },
    referralBonus:     { type: Number, default: 500 },
    trialDays:         { type: Number, default: 7 },
    maintenanceMode:   { type: Boolean, default: false },
    allowRegistration: { type: Boolean, default: true },
  },

  // ── Gym profile ────────────────────────────────────────────────
  gym_settings: {
    gymName:     { type: String, default: "" },
    ownerName:   { type: String, default: "" },
    email:       { type: String, default: "" },
    phone:       { type: String, default: "" },
    address:     { type: String, default: "" },
    city:        { type: String, default: "" },
    gstNumber:   { type: String, default: "" },
    website:     { type: String, default: "" },
    description: { type: String, default: "" },
    currency:    { type: String, default: "INR" },
    timezone:    { type: String, default: "Asia/Kolkata" },
    taxRate:     { type: Number, default: 18 },
    autoInvoice: { type: Boolean, default: true },
    autoReminder:{ type: Boolean, default: true },
    reminderDays:{ type: Number, default: 7 },
  },

  // ── Gym timings ────────────────────────────────────────────────
  timings: {
    monday:    { type: timingSchema, default: () => ({ open: "05:30", close: "23:00" }) },
    tuesday:   { type: timingSchema, default: () => ({ open: "05:30", close: "23:00" }) },
    wednesday: { type: timingSchema, default: () => ({ open: "05:30", close: "23:00" }) },
    thursday:  { type: timingSchema, default: () => ({ open: "05:30", close: "23:00" }) },
    friday:    { type: timingSchema, default: () => ({ open: "05:30", close: "23:00" }) },
    saturday:  { type: timingSchema, default: () => ({ open: "06:00", close: "22:00" }) },
    sunday:    { type: timingSchema, default: () => ({ open: "07:00", close: "21:00" }) },
  },

  // ── Notification preferences ───────────────────────────────────
  notifications: {
    emailEnabled:   { type: Boolean, default: true },
    smsEnabled:     { type: Boolean, default: false },
    pushEnabled:    { type: Boolean, default: true },
    newMember:      { type: Boolean, default: true },
    paymentSuccess: { type: Boolean, default: true },
    expiryReminder: { type: Boolean, default: true },
    classReminder:  { type: Boolean, default: true },
    lowInventory:   { type: Boolean, default: true },
    dailyReport:    { type: Boolean, default: false },
  },

  // ── Billing ────────────────────────────────────────────────────
  billing: {
    planName:       { type: String, default: "Basic" },
    billingCycle:   { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    nextBillingDate:{ type: Date, default: null },
    paymentMethod:  { type: String, default: "" },
    cardLast4:      { type: String, default: "" },
    autoRenew:      { type: Boolean, default: true },
  },
}, { timestamps: true });

module.exports = mongoose.model("Settings", settingsSchema);
