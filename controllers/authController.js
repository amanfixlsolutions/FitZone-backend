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
const logger = require("../utils/logger");

// ── Brute-force protection ─────────────────────────────────────────
const loginAttempts = new Map(); // ip → { count, firstAttempt, blockedUntil }
const MAX_ATTEMPTS  = 10;
const WINDOW_MS     = 15 * 60 * 1000; // 15 minutes
const BLOCK_MS      = 30 * 60 * 1000; // 30 minutes

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

  // Always try to send email — if it fails, return error (no dummy OTP)
  try {
    await sendOTPEmail(email, otp, type);
  } catch (err) {
    const emailError = err.message || "SMTP error";
    logger.error(`OTP email failed for ${email}: ${emailError}`);

    // Clean up the OTP we just created since we can't deliver it
    await OTP.deleteMany({ email: email.toLowerCase(), type }).catch(() => {});

    return next(new AppError(
      `Failed to send OTP email. Please check your email address and try again. (${emailError})`,
      500
    ));
  }

  return res.json({
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
// @GET /api/auth/gyms-public
// Public list of active gyms for signup gym selection
// ─────────────────────────────────────────────────────────────────
exports.getPublicGyms = asyncHandler(async (req, res) => {
  const gyms = await Gym.find({ status: "active" })
    .select("name city address logo totalMembers rating description")
    .sort({ name: 1 })
    .limit(100);

  res.json({ success: true, data: gyms });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/auth/register
// Register after OTP verification
// ─────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone, verifyToken, role = "member", gymId } = req.body;

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

  // Validate gymId if provided (member role)
  let linkedGym = null;
  if (gymId && role === "member") {
    linkedGym = await Gym.findOne({ _id: gymId, status: "active" });
    if (!linkedGym) return next(new AppError("Selected gym not found or not active.", 400));
  }

  // Create user — link to gym if provided
  const user = await User.create({
    name,
    email,
    password,
    phone: phone || "",
    role,
    gym:  linkedGym?._id || undefined,
    isEmailVerified: true,
    avatar: name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2),
  });

  // ── Auto-create Member record in the selected gym ──────────────
  if (linkedGym && role === "member") {
    try {
      const Member = require("../models/Member");
      const { generateMemberQR } = require("../services/qrService");

      // Generate QR for the new member
      const { qrId, qrCode } = await generateMemberQR(email.toLowerCase());

      await Member.create({
        user:     user._id,
        gym:      linkedGym._id,
        addedBy:  user._id,
        name:     name.trim(),
        email:    email.toLowerCase(),
        phone:    phone || "",
        status:   "Active",
        joinDate: new Date(),
        selfRegistered: true,
        qrId,
        qrCode,
      });

      // Increment gym member count
      await Gym.findByIdAndUpdate(linkedGym._id, {
        $inc: { totalMembers: 1, activeMembers: 1 },
      });

      // Notify gym owner
      const { createNotification } = require("../services/notificationService");
      await createNotification({
        gym:     linkedGym._id,
        title:   "New Member Self-Registered",
        message: `${name} joined ${linkedGym.name} via self-registration.`,
        type:    "member",
        audience: "specific-gym",
      }).catch(() => {});
    } catch (memberErr) {
      // Non-blocking — user account is created, member record failure is logged
      logger.error(`Auto-create member failed for ${email}: ${memberErr.message}`);
    }
  }

  // Send welcome email
  try { await sendWelcome(user); } catch (_) {}

  // Log activity
  await ActivityLog.create({
    user: user._id, userName: user.name, role: user.role,
    action: "REGISTER", module: "Auth",
    details: `New ${role} registered: ${name}${linkedGym ? ` → ${linkedGym.name}` : ""}`,
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

  // ── Brute-force check ──────────────────────────────────────────
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record) {
    // Check if currently blocked
    if (record.blockedUntil && now < record.blockedUntil) {
      return next(new AppError("Too many failed login attempts. Try again in 30 minutes.", 429));
    }
    // Reset window if it has expired
    if (now - record.firstAttempt > WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    // Track failed attempt
    const existing = loginAttempts.get(ip);
    if (existing && now - existing.firstAttempt <= WINDOW_MS) {
      existing.count += 1;
      if (existing.count >= MAX_ATTEMPTS) {
        existing.blockedUntil = now + BLOCK_MS;
        // Alert super-admin (non-blocking)
        const { createNotification } = require("../services/notificationService");
        createNotification({
          title:    "Brute-Force Alert",
          message:  `IP ${ip} has been blocked after ${MAX_ATTEMPTS} failed login attempts.`,
          type:     "security",
          audience: "super-admin",
        }).catch(() => {});
      }
    } else {
      loginAttempts.set(ip, { count: 1, firstAttempt: now, blockedUntil: null });
    }
    return next(new AppError("Invalid email or password.", 401));
  }

  if (user.status === "banned") {
    return next(new AppError("Your account has been banned. Contact support.", 403));
  }

  // Successful login — clear failed attempt record
  loginAttempts.delete(ip);

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

  const userData = user.toJSON();
  if (userData.gym && typeof userData.gym === "object") {
    userData.gymName = userData.gym.name;
  }

  // ── Also fetch Member record to get latest plan info ──────────
  // This ensures plan shows even if User.plan wasn't updated
  if (user.role === "member" && !userData.plan) {
    try {
      const Member = require("../models/Member");
      const member = await Member.findOne({ email: user.email.toLowerCase() })
        .populate("plan", "name");
      if (member?.planName) {
        userData.plan       = member.planName;
        userData.planExpiry = member.expiryDate;
        userData.planId     = member.plan?._id || member.plan;
        // Also update User record so next getMe is faster
        await User.findByIdAndUpdate(user._id, {
          plan:       member.planName,
          planExpiry: member.expiryDate,
          planId:     member.plan?._id || member.plan,
        });
      }
    } catch { /* silent */ }
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

    // Issue new access token + new refresh token
    const newAccessToken  = generateAccessToken(user._id);
    const newRefreshToken = require("../utils/generateToken").generateRefreshToken(user._id);

    res.cookie("fitzone_access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      path: "/",
    });

    // Return user identity so frontend can validate session belongs to correct user
    res.json({
      success:      true,
      accessToken:  newAccessToken,
      refreshToken: newRefreshToken, // rotate refresh token
      userId:       user._id,
      userRole:     user.role,
      message:      "Token refreshed.",
    });
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
