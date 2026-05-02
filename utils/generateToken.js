const jwt = require("jsonwebtoken");

// ── Generate access token (short-lived: 15 min) ────────────────────
exports.generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "15m",
  });

// ── Generate refresh token (long-lived: 30 days) ───────────────────
exports.generateRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || "30d",
  });

// ── Cookie options ─────────────────────────────────────────────────
const cookieOptions = {
  httpOnly: true,           // Not accessible via JS (XSS protection)
  secure: process.env.NODE_ENV === "production", // HTTPS only in prod
  sameSite: "lax",          // CSRF protection
  path: "/",
};

// ── Send tokens — body + httpOnly cookie ──────────────────────────
exports.sendTokenResponse = (user, statusCode, res) => {
  const accessToken  = exports.generateAccessToken(user._id);
  const refreshToken = exports.generateRefreshToken(user._id);

  const accessExpiry  = new Date(Date.now() + 15 * 60 * 1000);
  const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Set httpOnly cookies (works in production / same-origin)
  res.cookie("fitzone_access_token", accessToken, {
    ...cookieOptions,
    expires: accessExpiry,
  });
  res.cookie("fitzone_refresh_token", refreshToken, {
    ...cookieOptions,
    expires: refreshExpiry,
  });

  // ALSO return tokens in body so frontend can store in localStorage
  // (needed for cross-origin dev: port 3000 → port 5000)
  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      _id:             user._id,
      name:            user.name,
      email:           user.email,
      role:            user.role,
      avatar:          user.avatar,
      phone:           user.phone,
      gym:             user.gym,
      plan:            user.plan,
      planExpiry:      user.planExpiry,
      status:          user.status,
      isEmailVerified: user.isEmailVerified,
    },
  });
};

// ── Clear auth cookies (logout) ────────────────────────────────────
exports.clearCookies = (res) => {
  res.cookie("fitzone_access_token",  "", { ...cookieOptions, expires: new Date(0) });
  res.cookie("fitzone_refresh_token", "", { ...cookieOptions, expires: new Date(0) });
};
