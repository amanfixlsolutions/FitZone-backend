const Gym = require("../models/Gym");
const Payment = require("../models/Payment");
const Attendance = require("../models/Attendance");

/**
 * Calculate Monthly Recurring Revenue (MRR)
 * Sum of all active subscription payments normalized to monthly
 */
exports.calculateMRR = async () => {
  try {
    const gyms = await Gym.find({
      "subscription.status": "active",
    }).select("subscription").lean();

    let mrr = 0;
    for (const gym of gyms) {
      const { billingCycle, lastPaymentAmount } = gym.subscription || {};
      if (!lastPaymentAmount) continue;

      if (billingCycle === "monthly") {
        mrr += lastPaymentAmount;
      } else if (billingCycle === "yearly") {
        mrr += lastPaymentAmount / 12;
      }
    }

    return Math.round(mrr);
  } catch (err) {
    return 0;
  }
};

/**
 * Calculate Annual Recurring Revenue (ARR)
 * ARR = MRR * 12
 */
exports.calculateARR = async () => {
  try {
    const mrr = await exports.calculateMRR();
    return mrr * 12;
  } catch (err) {
    return 0;
  }
};

/**
 * Calculate Churn Rate
 * (gyms that cancelled/expired this month) / (active gyms start of month) * 100
 */
exports.calculateChurnRate = async () => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Gyms that expired or cancelled in the last 30 days
    const churnedCount = await Gym.countDocuments({
      $or: [
        { "subscription.status": "expired" },
        { "subscription.status": "cancelled" },
      ],
      "subscription.expiryDate": {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: now,
      },
    });

    // Active gyms at start of month
    const activeAtStart = await Gym.countDocuments({
      "subscription.status": "active",
      createdAt: { $lt: startOfMonth },
    });

    if (activeAtStart === 0) return 0;
    return Math.round((churnedCount / activeAtStart) * 100 * 100) / 100; // 2 decimal places
  } catch (err) {
    return 0;
  }
};

/**
 * Get Active Tenant Count
 */
exports.getActiveTenantCount = async () => {
  try {
    return await Gym.countDocuments({ status: "active" });
  } catch (err) {
    return 0;
  }
};

/**
 * Get Average Revenue Per Tenant
 */
exports.getAverageRevenuePerTenant = async () => {
  try {
    const activeTenants = await exports.getActiveTenantCount();
    if (activeTenants === 0) return 0;

    const totalRevenue = await Payment.aggregate([
      { $match: { status: "Success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const total = totalRevenue[0]?.total || 0;
    return Math.round(total / activeTenants);
  } catch (err) {
    return 0;
  }
};

/**
 * Get Platform Commission Total
 */
exports.getPlatformCommissionTotal = async () => {
  try {
    const result = await Payment.aggregate([
      { $match: { status: "Success" } },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);
    return result[0]?.total || 0;
  } catch (err) {
    return 0;
  }
};

/**
 * Get Tenant Health Summary
 * Returns: { expiringSoon, overduePayments, lowActivity, trialEnding }
 */
exports.getTenantHealthSummary = async () => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Expiring soon: active subscriptions expiring within 7 days
    const expiringSoon = await Gym.find({
      "subscription.status": "active",
      "subscription.expiryDate": {
        $gte: now,
        $lte: sevenDaysFromNow,
      },
    })
      .select("name city subscription.expiryDate")
      .lean();

    // Overdue payments: expired subscriptions past grace period
    const overduePayments = await Gym.find({
      "subscription.status": "expired",
      "subscription.gracePeriodEndsAt": { $lt: now },
    })
      .select("name city subscription.expiryDate")
      .lean();

    // Low activity: no attendance records in last 14 days
    const allActiveGyms = await Gym.find({ status: "active" })
      .select("_id name city")
      .lean();

    const lowActivity = [];
    for (const gym of allActiveGyms) {
      const recentAttendance = await Attendance.countDocuments({
        gym: gym._id,
        createdAt: { $gte: fourteenDaysAgo },
      });
      if (recentAttendance === 0) {
        lowActivity.push({
          _id: gym._id,
          name: gym.name,
          city: gym.city,
        });
      }
    }

    // Trial ending: trial status with trialEndsAt within 7 days
    const trialEnding = await Gym.find({
      "subscription.status": "trial",
      trialEndsAt: {
        $gte: now,
        $lte: sevenDaysFromNow,
      },
    })
      .select("name city trialEndsAt")
      .lean();

    return {
      expiringSoon,
      overduePayments,
      lowActivity,
      trialEnding,
    };
  } catch (err) {
    return {
      expiringSoon: [],
      overduePayments: [],
      lowActivity: [],
      trialEnding: [],
    };
  }
};
