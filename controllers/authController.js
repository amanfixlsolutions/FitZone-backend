const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const OTP = require("../models/OTP");
const Gym = require("../models/Gym");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendTokenResponse, generateAccessToken, generateRefreshToken, clearCookies } = require("../utils/generateToken");
const AppError = require("../utils/AppError");
const { sendOTPEmail, sendWelcomeEmail: sendWelcome, sendPasswordResetEmail } = require("../services/emailService");

// ── Helper: generate 6-digit OTP ──────────────────────────────────
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/send-otp
// Send OTP to email before registration
// ─────────────────────────────────────────────────────────────────
exports.sendOTP = asyncHandler(async (req, res, next) => {
  const { email, type = "signup" } = req.body;
  if (!email) return next(new AppError("Email is required.", 400));

  // For signup: check email not already registered
  if (type === "signup") {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return next(new AppError("Email is already registered.", 400));
  }

  // Delete any existing OTP for this email+type
  await OTP.deleteMany({ email: email.toLowerCase(), type });

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRE_MINUTES) || 10) * 60 * 1000);

  await OTP.create({ email: email.toLowerCase(), otp, type, expiresAt });

  // Send OTP email
  try {
    await sendOTPEmail(email, otp, type);
  } catch (err) {
    await OTP.deleteMany({ email: email.toLowerCase(), type });
    return next(new AppError("Failed to send OTP email. Please try again.", 500));
  }

  res.json({
    success: true,
    message: `OTP sent to ${email}. Valid for ${process.env.OTP_EXPIRE_MINUTES || 10} minutes.`,
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/verify-otp
// Verify OTP (returns a short-lived verification token)
// ─────────────────────────────────────────────────────────────────
exports.verifyOTP = asyncHandler(async (req, res, next) => {
  const { email, otp, type = "signup" } = req.body;
  if (!email || !otp) return next(new AppError("Email and OTP are required.", 400));

  const record = await OTP.findOne({
    email: email.toLowerCase(),
    type,
    verified: false,
    expiresAt: { $gt: new Date() },
  });

  if (!record) return next(new AppError("OTP is invalid or has expired.", 400));
  if (record.otp !== otp) return next(new AppError("Incorrect OTP.", 400));

  // Mark as verified
  record.verified = true;
  await record.save();

  // Issue a short-lived verification token (5 min)
  const verifyToken = jwt.sign(
    { email: email.toLowerCase(), type, verified: true },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  );

  res.json({ success: true, message: "OTP verified.", verifyToken });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/register
// Register after OTP verification
// ─────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, verifyToken, role = "member" } = req.body;

  if (!name || !email || !password) {
    return next(new AppError("Name, email and password are required.", 400));
  }

  // Verify the OTP token
  if (!verifyToken) return next(new AppError("Email verification required. Please verify OTP first.", 400));

  let decoded;
  try {
    decoded = jwt.verify(verifyToken, process.env.JWT_SECRET);
  } catch {
    return next(new AppError("Verification token expired. Please verify OTP again.", 400));
  }

  if (decoded.email !== email.toLowerCase() || !decoded.verified) {
    return next(new AppError("Email verification mismatch.", 400));
  }

  // Check email not already taken
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return next(new AppError("Email already registered.", 400));

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    phone: phone || "",
    role,
    isEmailVerified: true,
    avatar: name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2),
  });

  // Send welcome email
  try { await sendWelcome(user); } catch (_) {}

  // Log activity
  await ActivityLog.create({
    user: user._id, userName: user.name, role: user.role,
    action: "REGISTER", module: "Auth",
    details: `New ${role} registered: ${name}`,
    ip: req.ip,
  });

  sendTokenResponse(user, 201, res);
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/login
// ─────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new AppError("Email and password are required.", 400));

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    return next(new AppError("Invalid email or password.", 401));
  }

  if (user.status === "banned") {
    return next(new AppError("Your account has been banned. Contact support.", 403));
  }

  // Update last login — use updateOne to avoid triggering pre-save hook
  await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

  // Log activity
  await ActivityLog.create({
    user: user._id, userName: user.name, role: user.role,
    action: "LOGIN", module: "Auth",
    details: `${user.name} logged in`,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  }).catch((error) => {
    console.error("Failed to log activity:", error);
    
  });

  sendTokenResponse(user, 200, res);
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  clearCookies(res);

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "LOGOUT", module: "Auth",
    details: `${req.user.name} logged out`,
    ip: req.ip,
  }).catch(() => {});

  res.json({ success: true, message: "Logged out successfully." });
});

// ─────────────────────────────────────────────────────────────────
// @GET /api/auth/me
// ─────────────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate("gym", "name city status logo");

  // Add gymName as a convenience string field
  const userData = user.toJSON();
  if (userData.gym && typeof userData.gym === "object") {
    userData.gymName = userData.gym.name;
  }

  res.json({ success: true, user: userData });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/refresh
// Refresh access token using refresh token cookie
// ─────────────────────────────────────────────────────────────────
exports.refreshToken = asyncHandler(async (req, res, next) => {
  // Try cookie first, then body (cross-origin dev)
  const token = req.cookies?.fitzone_refresh_token || req.body?.refreshToken;
  if (!token) return next(new AppError("No refresh token. Please log in.", 401));

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return next(new AppError("User not found.", 401));
    if (user.status === "banned") return next(new AppError("Account banned.", 403));

    // Issue new access token cookie + return in body
    const newAccessToken = generateAccessToken(user._id);
    res.cookie("fitzone_access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(Date.now() + 15 * 60 * 1000),
      path: "/",
    });

    res.json({ success: true, accessToken: newAccessToken, message: "Token refreshed." });
  } catch {
    clearCookies(res);
    return next(new AppError("Refresh token expired. Please log in again.", 401));
  }
});

// ─────────────────────────────────────────────────────────────────
// @PUT /api/auth/change-password
// ─────────────────────────────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(new AppError("Current and new password are required.", 400));
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.matchPassword(currentPassword))) {
    return next(new AppError("Current password is incorrect.", 400));
  }
  if (newPassword.length < 6) {
    return next(new AppError("New password must be at least 6 characters.", 400));
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password changed successfully." });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user) return next(new AppError("No account found with that email.", 404));

  // Generate OTP for password reset
  await OTP.deleteMany({ email: email.toLowerCase(), type: "reset-password" });
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await OTP.create({ email: email.toLowerCase(), otp, type: "reset-password", expiresAt });

  try {
    await sendOTPEmail(email, otp, "reset-password");
  } catch {
    return next(new AppError("Failed to send reset email.", 500));
  }

  res.json({ success: true, message: "Password reset OTP sent to your email." });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return next(new AppError("Email, OTP and new password are required.", 400));
  }

  const record = await OTP.findOne({
    email: email.toLowerCase(),
    type: "reset-password",
    verified: false,
    expiresAt: { $gt: new Date() },
  });

  if (!record || record.otp !== otp) {
    return next(new AppError("Invalid or expired OTP.", 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return next(new AppError("User not found.", 404));

  user.password = newPassword;
  await user.save();

  await OTP.deleteMany({ email: email.toLowerCase(), type: "reset-password" });

  res.json({ success: true, message: "Password reset successfully. Please log in." });
});
