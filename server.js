const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = require("./config/db");
const { initSocket } = require("./sockets");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const { tenantRateLimiter } = require("./middleware/rateLimiter");

// ── Route imports ──────────────────────────────────────────────────
const authRoutes         = require("./routes/auth");
const gymRoutes          = require("./routes/gyms");
const memberRoutes       = require("./routes/members");
const trainerRoutes      = require("./routes/trainers");
const classRoutes        = require("./routes/classes");
const attendanceRoutes   = require("./routes/attendance");
const planRoutes         = require("./routes/plans");
const paymentRoutes      = require("./routes/payments");
const invoiceRoutes      = require("./routes/invoices");
const notificationRoutes = require("./routes/notifications");
const analyticsRoutes    = require("./routes/analytics");
const settingsRoutes     = require("./routes/settings");
const uploadRoutes       = require("./routes/uploads");
const zoomRoutes         = require("./routes/zoom");
const promoRoutes        = require("./routes/promos");
const reviewRoutes       = require("./routes/reviews");
const blogRoutes         = require("./routes/blog");
const logRoutes          = require("./routes/logs");
const inventoryRoutes    = require("./routes/inventory");
const campaignRoutes     = require("./routes/campaigns");
const systemRoutes       = require("./routes/system");
const liveClassRoutes    = require("./routes/liveClasses");

// ── Connect DB ─────────────────────────────────────────────────────
connectDB();

const app = express();
const server = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────
initSocket(server);

// ── CORS — MUST be first, before rate limiter and helmet ───────────
const corsOptions = {
  origin: function (origin, callback) {
    const allowed = [
      "http://localhost:3000",
      "http://localhost:3001",
      process.env.CLIENT_URL,
      "https://gym-fit-zone.vercel.app",
    ].filter(Boolean).map(o => o.replace(/\/+$/, "")); // Remove trailing slashes

    // Allow requests with no origin (mobile apps, curl, Postman, Render health checks)
    if (!origin) return callback(null, true);

    // Allow exact matches
    if (allowed.includes(origin)) return callback(null, true);

    // Allow any *.vercel.app preview deployments
    if (origin.endsWith(".vercel.app")) return callback(null, true);

    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS for all routes (Express 5 compatible)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
    return res.sendStatus(200);
  }
  next();
});

// ── Security Middleware ────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── NoSQL Injection sanitizer (replaces express-mongo-sanitize) ────
// express-mongo-sanitize is incompatible with Express 5 (req.query is read-only)
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        if (key.startsWith("$") || key.includes(".")) {
          delete obj[key];
        } else if (typeof obj[key] === "object") {
          sanitize(obj[key]);
        }
      }
    }
  };
  if (req.body)   sanitize(req.body);
  if (req.params) sanitize(req.params);
  next();
});

// ── Cookie Parser ──────────────────────────────────────────────────
app.use(cookieParser());

// ── Body Parsers ───────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Rate Limiting — after CORS so preflight is never blocked ───────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS", // Never rate-limit preflight
  message: { success: false, message: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ── Per-tenant rate limiter — 500 req/15min per gymId (after global limiter) ─
app.use("/api/", tenantRateLimiter);

// ── Logger ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ── Static files — serve from public/uploads ──────────────────────
// Must be BEFORE the 404 handler and API routes
const uploadsPath = require("path").join(__dirname, "public/uploads");
app.use("/uploads", express.static(uploadsPath, {
  fallthrough: false, // return 404 from static middleware itself, not JSON 404
  setHeaders: (res) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day cache
  },
}));

// Handle static file 404s gracefully (return empty 404, not JSON)
app.use("/uploads", (err, req, res, next) => {
  if (err.status === 404) {
    return res.status(404).end();
  }
  next(err);
});

// ── Health Check ───────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "FitZone API is running", timestamp: new Date() });
});

// ── Image serve endpoint — /api/images/:folder/:filename ───────────
// Reliable fallback when static middleware fails
app.get("/api/images/:folder/:filename", (req, res) => {
  const { folder, filename } = req.params;
  // Security: only allow alphanumeric, dash, underscore, dot in names
  if (!/^[a-zA-Z0-9_-]+$/.test(folder) || !/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
    return res.status(400).end();
  }
  const filePath = require("path").join(__dirname, "public/uploads", folder, filename);
  if (!require("fs").existsSync(filePath)) {
    return res.status(404).end();
  }
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(filePath);
});

// ── API Routes ─────────────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/gyms",          gymRoutes);
app.use("/api/members",       memberRoutes);
app.use("/api/trainers",      trainerRoutes);
app.use("/api/classes",       classRoutes);
app.use("/api/attendance",    attendanceRoutes);
app.use("/api/plans",         planRoutes);
app.use("/api/payments",      paymentRoutes);
app.use("/api/invoices",      invoiceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics",     analyticsRoutes);
app.use("/api/settings",      settingsRoutes);
app.use("/api/uploads",       uploadRoutes);
app.use("/api/zoom",          zoomRoutes);
app.use("/api/promos",        promoRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/blog",          blogRoutes);
app.use("/api/logs",          logRoutes);
app.use("/api/inventory",     inventoryRoutes);
app.use("/api/campaigns",     campaignRoutes);
app.use("/api/system",        systemRoutes);
app.use("/api/live-classes",  liveClassRoutes);

// ── 404 Handler ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ───────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 FitZone Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = { app, server };
