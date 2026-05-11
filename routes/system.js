const express = require("express");
const router  = express.Router();
const { protect, superAdminOnly } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const mongoose = require("mongoose");
const os = require("os");
const fs = require("fs");
const path = require("path");
const ActivityLog = require("../models/ActivityLog");
const { paginate, buildPaginationMeta } = require("../utils/pagination");

// ── @GET /api/system/health ────────────────────────────────────────
router.get("/health", protect, superAdminOnly, asyncHandler(async (req, res) => {
  const start = Date.now();

  // ── MongoDB ping ───────────────────────────────────────────────
  let dbStatus = "Operational";
  let dbLatency = 0;
  try {
    const t0 = Date.now();
    await mongoose.connection.db.admin().ping();
    dbLatency = Date.now() - t0;
  } catch {
    dbStatus = "Down";
  }

  // ── Server / process metrics ───────────────────────────────────
  const memUsage  = process.memoryUsage();
  const totalMem  = os.totalmem();
  const freeMem   = os.freemem();
  const usedMem   = totalMem - freeMem;
  const memPct    = Math.round((usedMem / totalMem) * 100);
  const uptimeSec = process.uptime();

  // ── Log file stats ─────────────────────────────────────────────
  const errorLogPath    = path.join(__dirname, "../logs/error.log");
  const combinedLogPath = path.join(__dirname, "../logs/combined.log");

  let errorLogLines   = 0;
  let combinedLogSize = 0;
  let recentErrors    = [];

  try {
    const errorContent = fs.readFileSync(errorLogPath, "utf8");
    const lines = errorContent.trim().split("\n").filter(Boolean);
    errorLogLines = lines.length;
    // Last 20 error lines, newest first
    recentErrors = lines
      .slice(-20)
      .reverse()
      .map((line, i) => {
        // Parse: [2026-04-30 13:41:17] ERROR: message | METHOD /path | IP: x
        const match = line.match(/\[(.+?)\]\s+(\w+):\s+(.+?)(?:\s+\|\s+(\w+)\s+(\/\S+))?(?:\s+\|\s+IP:\s+(\S+))?$/);
        return {
          id:      `ERR${String(i + 1).padStart(3, "0")}`,
          time:    match?.[1] || "",
          level:   match?.[2] || "ERROR",
          message: match?.[3] || line.slice(0, 120),
          method:  match?.[4] || "",
          path:    match?.[5] || "",
          ip:      match?.[6] || "",
        };
      });
  } catch { /* log file may not exist yet */ }

  try {
    const stat = fs.statSync(combinedLogPath);
    combinedLogSize = stat.size;
  } catch { /* ignore */ }

  // ── Activity log stats ─────────────────────────────────────────
  const [totalLogs, successLogs, failedLogs, warningLogs] = await Promise.all([
    ActivityLog.countDocuments(),
    ActivityLog.countDocuments({ status: "success" }),
    ActivityLog.countDocuments({ status: "failed" }),
    ActivityLog.countDocuments({ status: "warning" }),
  ]);

  // Logs by module
  const logsByModule = await ActivityLog.aggregate([
    { $group: { _id: "$module", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  // ── Services status ────────────────────────────────────────────
  const services = [
    {
      name:    "API Server",
      status:  "Operational",
      latency: `${Date.now() - start}ms`,
      uptime:  formatUptime(uptimeSec),
      detail:  `Node ${process.version} · PID ${process.pid}`,
    },
    {
      name:    "Database (MongoDB)",
      status:  dbStatus,
      latency: `${dbLatency}ms`,
      uptime:  dbStatus === "Operational" ? "Connected" : "Disconnected",
      detail:  `State: ${["disconnected","connected","connecting","disconnecting"][mongoose.connection.readyState] || "unknown"}`,
    },
    {
      name:    "Email Service",
      status:  process.env.EMAIL_USER ? "Configured" : "Not Configured",
      latency: "—",
      uptime:  "—",
      detail:  process.env.EMAIL_USER ? `SMTP: ${process.env.EMAIL_HOST}` : "EMAIL_USER not set",
    },
    {
      name:    "Razorpay Gateway",
      status:  process.env.RAZORPAY_KEY_ID ? "Configured" : "Not Configured",
      latency: "—",
      uptime:  "—",
      detail:  process.env.RAZORPAY_KEY_ID ? "Key configured" : "RAZORPAY_KEY_ID not set",
    },
    {
      name:    "Stripe Gateway",
      status:  process.env.STRIPE_SECRET_KEY ? "Configured" : "Not Configured",
      latency: "—",
      uptime:  "—",
      detail:  process.env.STRIPE_SECRET_KEY ? "Key configured" : "STRIPE_SECRET_KEY not set",
    },
    {
      name:    "Cloudinary",
      status:  process.env.CLOUDINARY_CLOUD_NAME ? "Configured" : "Not Configured",
      latency: "—",
      uptime:  "—",
      detail:  process.env.CLOUDINARY_CLOUD_NAME ? `Cloud: ${process.env.CLOUDINARY_CLOUD_NAME}` : "Not configured",
    },
    {
      name:    "Zoom Integration",
      status:  process.env.ZOOM_CLIENT_ID ? "Configured" : "Not Configured",
      latency: "—",
      uptime:  "—",
      detail:  process.env.ZOOM_CLIENT_ID ? "OAuth configured" : "ZOOM_CLIENT_ID not set",
    },
  ];

  res.json({
    success: true,
    data: {
      services,
      server: {
        nodeVersion:  process.version,
        platform:     process.platform,
        arch:         process.arch,
        pid:          process.pid,
        uptimeSec:    Math.round(uptimeSec),
        uptimeStr:    formatUptime(uptimeSec),
        env:          process.env.NODE_ENV || "development",
        memUsedMB:    Math.round(memUsage.rss / 1024 / 1024),
        memHeapMB:    Math.round(memUsage.heapUsed / 1024 / 1024),
        memTotalMB:   Math.round(totalMem / 1024 / 1024),
        memPct,
        cpuCount:     os.cpus().length,
        loadAvg:      os.loadavg().map(v => v.toFixed(2)),
      },
      logs: {
        totalActivity:  totalLogs,
        successLogs,
        failedLogs,
        warningLogs,
        errorLogLines,
        combinedLogSizeKB: Math.round(combinedLogSize / 1024),
        byModule:       logsByModule,
      },
      recentErrors,
      checkedAt: new Date().toISOString(),
    },
  });
}));

// ── @GET /api/system/logs ──────────────────────────────────────────
router.get("/logs", protect, superAdminOnly, asyncHandler(async (req, res) => {
  const { module: mod, status, search } = req.query;
  const filter = {};
  if (mod)    filter.module = mod;
  if (status) filter.status = status;
  if (search) filter.$or = [
    { action:  new RegExp(search, "i") },
    { details: new RegExp(search, "i") },
    { userName:new RegExp(search, "i") },
  ];

  const total = await ActivityLog.countDocuments(filter);
  const { query, pagination } = paginate(
    ActivityLog.find(filter).sort({ createdAt: -1 }),
    req.query
  );
  const logs = await query;

  res.json({
    success: true,
    data: logs,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
}));

// ── @POST /api/system/fix-member-qr ───────────────────────────────
// Regenerates QR codes for all members that have null/missing gymId in QR
// or were created with email as memberId (old bug)
router.post("/fix-member-qr", protect, superAdminOnly, asyncHandler(async (req, res) => {
  const Member = require("../models/Member");
  const { generateMemberQR } = require("../services/qrService");

  // Find all members
  const members = await Member.find({}).select("_id gym qrId qrCode name");
  let fixed = 0;
  let skipped = 0;
  const errors = [];

  for (const member of members) {
    try {
      if (!member.gym) {
        errors.push(`${member.name} (${member._id}): gym is null — skipped`);
        skipped++;
        continue;
      }
      // Regenerate QR with correct memberId + gymId
      const { qrId, qrCode } = await generateMemberQR(member._id, member.gym, "");
      await Member.findByIdAndUpdate(member._id, { qrId, qrCode });
      fixed++;
    } catch (err) {
      errors.push(`${member.name}: ${err.message}`);
    }
  }

  res.json({
    success: true,
    message: `QR codes regenerated: ${fixed} fixed, ${skipped} skipped (null gym)`,
    fixed,
    skipped,
    errors: errors.slice(0, 20),
  });
}));

// ── Helper ─────────────────────────────────────────────────────────
function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

module.exports = router;
