const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// ── Protect route — reads token from cookie OR Authorization header ─
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. httpOnly cookie (production / same-origin)
  if (req.cookies?.fitzone_access_token) {
    token = req.cookies.fitzone_access_token;
  }
  // 2. Authorization: Bearer <token> header (cross-origin dev)
  else if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  // 3. x-access-token header (fallback)
  else if (req.headers["x-access-token"]) {
    token = req.headers["x-access-token"];
  }

  if (!token) {
    return next(new AppError("Not authorized. Please log in.", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password -resetPasswordToken -resetPasswordExpires");

    if (!user) return next(new AppError("User no longer exists.", 401));
    if (user.status === "banned") return next(new AppError("Your account has been banned.", 403));

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError("Session expired. Please log in again.", 401));
    }
    return next(new AppError("Invalid token. Please log in again.", 401));
  }
});

// ── Authorize roles ────────────────────────────────────────────────
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. Required role: ${roles.join(" or ")}.`, 403));
  }
  next();
};

exports.superAdminOnly   = exports.authorize("super-admin");
exports.gymOwnerOnly     = exports.authorize("gym-owner");
exports.adminOrSuperAdmin = exports.authorize("super-admin", "gym-owner");

// ── Gym owner can only access their own gym ────────────────────────
exports.ownGymOnly = asyncHandler(async (req, res, next) => {
  if (req.user.role === "super-admin") return next();
  const gymId = req.params.gymId || req.body.gym || req.query.gym;
  if (gymId && req.user.gym?.toString() !== gymId.toString()) {
    return next(new AppError("Access denied. You can only manage your own gym.", 403));
  }
  next();
});
