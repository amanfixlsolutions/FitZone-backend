const Member = require("../models/Member");
const Gym = require("../models/Gym");
const Payment = require("../models/Payment");
const Attendance = require("../models/Attendance");
const Trainer = require("../models/Trainer");
const Class = require("../models/Class");
const Plan = require("../models/Plan");
const { asyncHandler } = require("../utils/asyncHandler");

// ── @GET /api/analytics/super-admin ───────────────────────────────
exports.getSuperAdminDashboard = asyncHandler(async (req, res) => {
  const [
    totalMembers, activeMembers,
    totalGyms, activeGyms, pendingGyms,
    totalTrainers,
    revenueData,
    recentPayments,
  ] = await Promise.all([
    Member.countDocuments(),
    Member.countDocuments({ status: "Active" }),
    Gym.countDocuments(),
    Gym.countDocuments({ status: "active" }),
    Gym.countDocuments({ status: "pending" }),
    Trainer.countDocuments(),
    Payment.aggregate([
      { $match: { status: "Success" } },
      { $group: { _id: null, total: { $sum: "$amount" }, commission: { $sum: "$commissionAmount" } } },
    ]),
    Payment.find({ status: "Success" }).sort({ createdAt: -1 }).limit(5).populate("member", "name"),
  ]);

  // Monthly revenue for chart (last 6 months)
  const now = new Date();
  const revenueChart = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const result = await Payment.aggregate([
      { $match: { status: "Success", createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, revenue: { $sum: "$amount" } } },
    ]);
    revenueChart.push({
      month: start.toLocaleString("default", { month: "short" }),
      revenue: result[0]?.revenue || 0,
    });
  }

  // Attendance chart (last 7 days)
  const attendanceChart = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const count = await Attendance.countDocuments({ date: d });
    attendanceChart.push({ date: d, count });
  }

  // Plan distribution
  const planDist = await Member.aggregate([
    { $group: { _id: "$planName", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  // City revenue breakdown
  const cityRevenue = await Payment.aggregate([
    { $match: { status: "Success" } },
    { $lookup: { from: "gyms", localField: "gym", foreignField: "_id", as: "gymData" } },
    { $unwind: { path: "$gymData", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$gymData.city", revenue: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: 6 },
  ]);

  // Member growth (new members per month, last 6 months)
  const memberGrowth = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const count = await Member.countDocuments({ createdAt: { $gte: start, $lte: end } });
    memberGrowth.push({ month: start.toLocaleString("default", { month: "short" }), count });
  }

  // Gym growth (new gyms per month, last 6 months)
  const gymGrowth = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const count = await Gym.countDocuments({ createdAt: { $gte: start, $lte: end } });
    gymGrowth.push({ month: start.toLocaleString("default", { month: "short" }), count });
  }

  // Top gyms
  const topGyms = await Gym.find({ status: "active" })
    .sort({ totalMembers: -1 })
    .limit(5)
    .select("name city totalMembers rating monthlyRevenue status");

  // Pending gyms for approval
  const pendingGymsList = await Gym.find({ status: "pending" })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("owner", "name email")
    .select("name ownerName city createdAt docs status");

  // Recent activity from notifications + logs
  const ActivityLog = require("../models/ActivityLog");
  const recentActivity = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .select("action module details userName role createdAt");

  // Map activity to notification-style format
  const activityFeed = recentActivity.map(a => ({
    title:     a.action?.replace(/_/g, " "),
    message:   a.details || `${a.userName} performed ${a.action}`,
    type:      a.module?.toLowerCase().includes("member") ? "member"
             : a.module?.toLowerCase().includes("payment") ? "payment"
             : a.module?.toLowerCase().includes("gym") ? "gym"
             : "system",
    createdAt: a.createdAt,
  }));

  res.json({
    success: true,
    data: {
      stats: {
        totalMembers,
        activeMembers,
        totalGyms,
        activeGyms,
        pendingGyms,
        totalTrainers,
        platformGMV:      revenueData[0]?.total      || 0,
        commissionEarned: revenueData[0]?.commission || 0,
      },
      revenueChart,
      attendanceChart,
      planDistribution: planDist,
      cityRevenue,
      memberGrowth,
      gymGrowth,
      topGyms,
      pendingGymsList,
      recentActivity: activityFeed,
      recentPayments,
    },
  });
});

// ── @GET /api/analytics/gym-owner ─────────────────────────────────
exports.getGymOwnerDashboard = asyncHandler(async (req, res) => {
  const gymId = req.user.gym;
  const today = new Date().toISOString().split("T")[0];

  const [
    totalMembers, activeMembers, pausedMembers, expiredMembers,
    totalTrainers,
    todayClasses,
    todayCheckins,
    revenueData,
  ] = await Promise.all([
    Member.countDocuments({ gym: gymId }),
    Member.countDocuments({ gym: gymId, status: "Active" }),
    Member.countDocuments({ gym: gymId, status: "Paused" }),
    Member.countDocuments({ gym: gymId, status: "Expired" }),
    Trainer.countDocuments({ gym: gymId, status: "Active" }),
    Class.countDocuments({ gym: gymId, status: "Active" }),
    Attendance.countDocuments({ gym: gymId, date: today }),
    Payment.aggregate([
      { $match: { gym: gymId, status: "Success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  // Revenue chart (last 6 months)
  const now = new Date();
  const revenueChart = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const result = await Payment.aggregate([
      { $match: { gym: gymId, status: "Success", createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, revenue: { $sum: "$amount" } } },
    ]);
    revenueChart.push({
      month: start.toLocaleString("default", { month: "short" }),
      revenue: result[0]?.revenue || 0,
    });
  }

  // Attendance chart (last 7 days)
  const attendanceChart = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const count = await Attendance.countDocuments({ gym: gymId, date: d });
    attendanceChart.push({ date: d, count });
  }

  // Recent check-ins
  const recentCheckins = await Attendance.find({ gym: gymId, date: today })
    .sort({ checkInTime: -1 })
    .limit(10)
    .select("memberName memberPlan checkInTime type");

  // Today's classes
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const todayDay = days[new Date().getDay()];
  const todayClassList = await Class.find({ gym: gymId, days: todayDay, status: "Active" })
    .populate("trainer", "name")
    .sort({ startTime: 1 });

  // Usage meters — fetch gym plan limits
  const gym = await Gym.findById(gymId).select("maxMembers maxTrainers subscriptionTier subscription trialEndsAt");

  res.json({
    success: true,
    data: {
      stats: {
        totalMembers,
        activeMembers,
        pausedMembers,
        expiredMembers,
        totalTrainers,
        todayClasses,
        todayCheckins,
        monthlyRevenue: revenueData[0]?.total || 0,
        // ── SaaS usage meters ──────────────────────────────────
        maxMembers:          gym?.maxMembers || 100,
        maxTrainers:         gym?.maxTrainers || 10,
        subscriptionTier:    gym?.subscriptionTier || "starter",
        subscriptionStatus:  gym?.subscription?.status || "trial",
        subscriptionExpiry:  gym?.subscription?.expiryDate || null,
        trialEndsAt:         gym?.trialEndsAt || null,
        memberUsagePercent:  Math.round((totalMembers / (gym?.maxMembers || 100)) * 100),
        trainerUsagePercent: Math.round((totalTrainers / (gym?.maxTrainers || 10)) * 100),
      },
      revenueChart,
      attendanceChart,
      recentCheckins,
      todayClassList,
    },
  });
});
