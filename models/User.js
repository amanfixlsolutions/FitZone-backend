const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role:     { type: String, enum: ["super-admin", "gym-owner", "member"], default: "member" },
  avatar:   { type: String, default: "" },
  phone:    { type: String, default: "" },

  // Email verification
  isEmailVerified: { type: Boolean, default: false },

  // Gym owner specific
  gym: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },

  // Member specific
  plan:       { type: String, default: "" },
  planExpiry: { type: Date, default: null },
  planId:     { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },

  // Tenant alias — mirrors the gym field for gym-owner and member roles
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },

  status:    { type: String, enum: ["active", "inactive", "banned"], default: "active" },
  lastLogin: { type: Date, default: null },

  // Password reset
  resetPasswordToken:   { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
}, { timestamps: true });

// ✅ FIXED: No 'next' parameter for async middleware
userSchema.pre("save", async function () {
  // Only hash if password was explicitly modified AND is a plain string (not already hashed)
  if (!this.isModified("password")) return;
  if (!this.password) return;
  // bcrypt hashes start with $2b$ — skip if already hashed
  if (this.password.startsWith("$2b$") || this.password.startsWith("$2a$")) return;
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
  } catch (error) {
    throw new Error(`Password hashing failed: ${error.message}`);
  }
});

// Compare password method
userSchema.methods.matchPassword = async function (entered) {
  if (!entered || !this.password) return false;
  return await bcrypt.compare(entered, this.password);
};

// Remove sensitive fields from JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model("User", userSchema);