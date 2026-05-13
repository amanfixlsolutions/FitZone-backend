const rateLimit = require("express-rate-limit");

// ── Per-tenant rate limiter — 500 req/15min per gymId (falls back to IP) ─
exports.tenantRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  keyGenerator: (req) => {
    // Use gymId for gym-owner requests, IP for others
    if (req.user?.gym) return `tenant:${req.user.gym.toString()}`;
    return `ip:${req.ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  handler: (req, res, next, options) => {
    res.setHeader("Retry-After", Math.ceil(options.windowMs / 1000));
    res.status(429).json(options.message);
  },
});
