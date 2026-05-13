const Gym = require("../models/Gym");
const Member = require("../models/Member");
const Trainer = require("../models/Trainer");
const Payment = require("../models/Payment");
const ActivityLog = require("../models/ActivityLog");
const TenantConfig = require("../models/TenantConfig");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const metricsService = require("../services/metricsService");
const { createNotification } = require("../services/notificationService");
const { sendGymApprovalEmail } = require("../services/emailService");

// ── @GET /api/super-admin/metrics ──────────────────────────────────
exports.getPlatformMetrics = asyncHandler(async (req, res) => {
  const [mrr, arr, churnRate, activeTenants, avgRevPerTenant, commissionTotal] =
    await Promise.all([
      metricsService.calculateMRR(),
      metricsService.calculateARR(),
      metricsService.calculateChurnRate(),
      metricsService.getActiveTenantCount(),
      metricsService.getAverageRevenuePerTenant(),
      metricsService.getPlatformCommissionTotal(),
    ]);

  res.json({
    success: true,
    data: {
      mrr,
      arr,
      churnRate,
      activeTenants,
      avgRevenuePerTenant: avgRevPerTenant,
      commissionTotal,
    },
  });
});

// ── @GET /api/super-admin/tenants ──────────────────────────────────
exports.getTenants = asyncHandler(async (req, res) => {
  const { status, search, page, limit } = req.query;
  const filter = {};

  if (status && status !== "all") filter.status = status;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, "i") },
      { city: new RegExp(search, "i") },
      { ownerName: new RegExp(search, "i") },
    ];
  }

  const total = await Gym.countDocuments(filter);
  const { query, pagination } = paginate(
    Gym.find(filter)
      .populate("owner", "name email")
      .sort({ createdAt: -1 }),
    { page, limit }
  );

  const gyms = await query;

  // Enrich with member counts and last payment
  const gymIds = gyms.map((g) => g._id);

  const [memberCounts, lastPayments] = await Promise.all([
    Member.aggregate([
      { $match: { gym: { $in: gymIds } } },
      {
        $group: {
          _id: "$gym",
          totalMembers: { $sum: 1 },
          activeMembers: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] } },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { gym: { $in: gymIds }, status: "Success" } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$gym",
          lastPaymentDate: { $first: "$createdAt" },
          monthlyRevenue: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  const memberMap = {};
  memberCounts.forEach((c) => { memberMap[c._id.toString()] = c; });

  const paymentMap = {};
  lastPayments.forEach((p) => { paymentMap[p._id.toString()] = p; });

  const now = new Date();
  const enriched = gyms.map((g) => {
    const plain = g.toObject();
    const counts = memberMap[g._id.toString()] || {};
    const payments = paymentMap[g._id.toString()] || {};

    plain.totalMembers = counts.totalMembers || 0;
    plain.activeMembers = counts.activeMembers || 0;
    plain.lastPaymentDate = payments.lastPaymentDate || null;
    plain.monthlyRevenue = payments.monthlyRevenue || 0;

    // Days until expiry
    if (g.subscription?.expiryDate) {
      const diff = new Date(g.subscription.expiryDate) - now;
      plain.daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));
    } else {
      plain.daysUntilExpiry = null;
    }

    return plain;
  });

  res.json({
    success: true,
    data: enriched,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/super-admin/tenants/:id ─────────────────────────────
exports.getTenantDetail = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id).populate("owner", "name email phone");
  if (!gym) return next(new AppError("Gym not found.", 404));

  const [
    totalMembers,
    activeMembers,
    totalTrainers,
    tenantConfig,
    recentActivity,
    revenueData,
  ] = await Promise.all([
    Member.countDocuments({ gym: gym._id }),
    Member.countDocuments({ gym: gym._id, status: "Active" }),
    Trainer.countDocuments({ gym: gym._id }),
    TenantConfig.findOne({ gym: gym._id }).lean(),
    ActivityLog.find({ gym: gym._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("action module details userName role createdAt status")
      .lean(),
    Payment.aggregate([
      { $match: { gym: gym._id, status: "Success" } },
      { $group: { _id: null, total: { $sum: "$amount" }, monthly: { $sum: "$amount" } } },
    ]),
  ]);

  const plain = gym.toObject();
  plain.totalMembers = totalMembers;
  plain.activeMembers = activeMembers;
  plain.totalTrainers = totalTrainers;
  plain.tenantConfig = tenantConfig || null;
  plain.recentActivity = recentActivity;
  plain.totalRevenue = revenueData[0]?.total || 0;

  // Days until expiry
  if (gym.subscription?.expiryDate) {
    const diff = new Date(gym.subscription.expiryDate) - new Date();
    plain.daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));
  } else {
    plain.daysUntilExpiry = null;
  }

  res.json({ success: true, data: plain });
});

// ── @POST /api/super-admin/tenants/:id/suspend ────────────────────
exports.suspendTenant = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id).populate("owner", "name email");
  if (!gym) return next(new AppError("Gym not found.", 404));

  if (gym.status === "suspended") {
    return next(new AppError("Gym is already suspended.", 400));
  }

  gym.status = "suspended";
  await gym.save();

  // Send email notification to gym owner
  try {
    if (gym.owner?.email) {
      const { sendEmail } = require("../services/emailService");
      await sendEmail({
        to: gym.owner.email,
        subject: "⚠️ Your gym has been suspended — FitZone",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="color:#1f2937">Hi ${gym.owner.name},</h2>
            <p style="color:#6b7280">Your gym <strong>${gym.name}</strong> has been suspended from the FitZone platform.</p>
            <p style="color:#6b7280">Please contact support for more information.</p>
          </div>
        `,
      });
    }
  } catch (_) {}

  // Create ActivityLog entry
  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    role: req.user.role,
    gym: gym._id,
    action: "SUSPEND_TENANT",
    module: "SuperAdmin",
    details: `Super-admin suspended gym: ${gym.name}`,
    tenantId: gym._id,
  });

  res.json({ success: true, message: "Gym suspended successfully.", data: gym });
});

// ── @POST /api/super-admin/tenants/:id/reactivate ─────────────────
exports.reactivateTenant = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id).populate("owner", "name email");
  if (!gym) return next(new AppError("Gym not found.", 404));

  gym.status = "active";
  await gym.save();

  // Create ActivityLog entry
  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    role: req.user.role,
    gym: gym._id,
    action: "REACTIVATE_TENANT",
    module: "SuperAdmin",
    details: `Super-admin reactivated gym: ${gym.name}`,
    tenantId: gym._id,
  });

  // Notify gym owner
  try {
    if (gym.owner?.email) {
      await sendGymApprovalEmail(gym.owner, gym.name, true);
    }
  } catch (_) {}

  res.json({ success: true, message: "Gym reactivated successfully.", data: gym });
});

// ── @POST /api/super-admin/tenants/:id/extend-trial ───────────────
exports.extendTrial = asyncHandler(async (req, res, next) => {
  const { days } = req.body;
  if (!days || isNaN(days) || days <= 0) {
    return next(new AppError("Please provide a valid number of days.", 400));
  }

  const gym = await Gym.findById(req.params.id);
  if (!gym) return next(new AppError("Gym not found.", 404));

  const msToAdd = Number(days) * 24 * 60 * 60 * 1000;

  // Extend expiryDate
  const currentExpiry = gym.subscription?.expiryDate
    ? new Date(gym.subscription.expiryDate)
    : new Date();
  gym.subscription.expiryDate = new Date(currentExpiry.getTime() + msToAdd);

  // Extend trialEndsAt
  const currentTrial = gym.trialEndsAt ? new Date(gym.trialEndsAt) : new Date();
  gym.trialEndsAt = new Date(currentTrial.getTime() + msToAdd);

  await gym.save();

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    role: req.user.role,
    gym: gym._id,
    action: "EXTEND_TRIAL",
    module: "SuperAdmin",
    details: `Extended trial for gym: ${gym.name} by ${days} days`,
    tenantId: gym._id,
  });

  res.json({ success: true, message: `Trial extended by ${days} days.`, data: gym });
});

// ── @PUT /api/super-admin/tenants/:id/feature-flags ───────────────
exports.updateFeatureFlags = asyncHandler(async (req, res, next) => {
  const { featureFlags } = req.body;
  if (!featureFlags || typeof featureFlags !== "object") {
    return next(new AppError("featureFlags object is required.", 400));
  }

  const gym = await Gym.findById(req.params.id);
  if (!gym) return next(new AppError("Gym not found.", 404));

  // Find or create TenantConfig
  let tenantConfig = await TenantConfig.findOne({ gym: gym._id });
  if (!tenantConfig) {
    tenantConfig = await TenantConfig.create({ gym: gym._id });
  }

  // Update feature flags using $set
  tenantConfig = await TenantConfig.findOneAndUpdate(
    { gym: gym._id },
    { $set: { featureFlags } },
    { new: true, runValidators: true }
  );

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    role: req.user.role,
    gym: gym._id,
    action: "UPDATE_FEATURE_FLAGS",
    module: "SuperAdmin",
    details: `Updated feature flags for gym: ${gym.name}`,
    tenantId: gym._id,
    data: featureFlags,
  });

  res.json({ success: true, message: "Feature flags updated.", data: tenantConfig });
});

// ── @POST /api/super-admin/broadcast ──────────────────────────────
exports.broadcastNotification = asyncHandler(async (req, res, next) => {
  const { title, message, audience = "all", type = "system" } = req.body;

  if (!title || !message) {
    return next(new AppError("title and message are required.", 400));
  }

  await createNotification({
    sender: req.user._id,
    title,
    message,
    type,
    audience,
  });

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    role: req.user.role,
    action: "BROADCAST_NOTIFICATION",
    module: "SuperAdmin",
    details: `Broadcast notification to ${audience}: "${title}"`,
  });

  res.json({ success: true, message: "Notification broadcast successfully." });
});

// ── @GET /api/super-admin/revenue ─────────────────────────────────
exports.getRevenueBreakdown = asyncHandler(async (req, res) => {
  const now = new Date();
  const months = [];

  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

    const result = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $in: ["Success", "Refunded"] },
        },
      },
      {
        $group: {
          _id: "$status",
          total: { $sum: "$amount" },
          commission: { $sum: "$commissionAmount" },
          net: { $sum: "$netAmount" },
        },
      },
    ]);

    const successData = result.find((r) => r._id === "Success") || {};
    const refundData = result.find((r) => r._id === "Refunded") || {};

    const gross = successData.total || 0;
    const commission = successData.commission || 0;
    const net = successData.net || gross - commission;
    const refunds = refundData.total || 0;

    months.push({
      month: start.toLocaleString("default", { month: "short", year: "2-digit" }),
      gross,
      commission,
      net,
      refunds,
    });
  }

  // Summary totals
  const totals = months.reduce(
    (acc, m) => ({
      gross: acc.gross + m.gross,
      commission: acc.commission + m.commission,
      net: acc.net + m.net,
      refunds: acc.refunds + m.refunds,
    }),
    { gross: 0, commission: 0, net: 0, refunds: 0 }
  );

  res.json({
    success: true,
    data: {
      months,
      totals,
    },
  });
});

// ── @GET /api/super-admin/activity ────────────────────────────────
exports.getActivityFeed = asyncHandler(async (req, res) => {
  const { action, gym, from, to } = req.query;
  const filter = {};

  if (action) filter.action = new RegExp(action, "i");
  if (gym) filter.gym = gym;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const logs = await ActivityLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("gym", "name city")
    .select("action module details userName role gym createdAt status ip")
    .lean();

  res.json({ success: true, data: logs });
});

// ── @GET /api/super-admin/health ──────────────────────────────────
exports.getTenantHealth = asyncHandler(async (req, res) => {
  const health = await metricsService.getTenantHealthSummary();

  res.json({
    success: true,
    data: {
      ...health,
      counts: {
        expiringSoon: health.expiringSoon.length,
        overduePayments: health.overduePayments.length,
        lowActivity: health.lowActivity.length,
        trialEnding: health.trialEnding.length,
      },
    },
  });
});
