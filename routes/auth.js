const express = require("express");
const router = express.Router();
const {
  sendOTP, verifyOTP, register, login, logout,
  getMe, refreshToken, changePassword,
  forgotPassword, resetPassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

// ── Public routes ──────────────────────────────────────────────────
router.post("/send-otp",        sendOTP);
router.post("/verify-otp",      verifyOTP);
router.post("/register",        register);
router.post("/login",           login);
router.post("/refresh",         refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password",  resetPassword);

// ── Protected routes ───────────────────────────────────────────────
router.get("/me",               protect, getMe);
router.post("/logout",          protect, logout);
router.put("/change-password",  protect, changePassword);

module.exports = router;
