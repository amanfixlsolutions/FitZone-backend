const crypto = require("crypto");
const Razorpay = require("razorpay");
const Gym = require("../models/Gym");
const SaaSSubscription = require("../models/SaaSSubscription");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const billingService = require("../services/billingService");

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const PLATFORM_PLANS = {
  starter:    { monthly: 999,  yearly: 9590  },
  growth:     { monthly: 2499, yearly: 23990 },
  enterprise: { monthly: 4999, yearly: 47990 },
};

// GET /api/billing/status
exports.getSubscriptionStatus = asyncHandler(async (req, res, next) => {
  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId).select("name status subscription subscriptionTier trialEndsAt");
  if (!gym) return next(new AppError("Gym not found.", 404));

  const saasSubscription = await SaaSSubscription.findOne({ gym: gymId });

  res.json({
    success: true,
    data: {
      gymStatus: gym.status,
      subscription: gym.subscription || {},
      saasSubscription: saasSubscription || null,
      tier: gym.subscriptionTier || "starter",
      trialEndsAt: gym.trialEndsAt || null,
    },
  });
});

// POST /api/billing/create-order
exports.createSubscriptionOrder = asyncHandler(async (req, res, next) => {
  if (!razorpay) return next(new AppError("Razorpay not configured.", 503));

  const { tier = "starter", billingCycle = "monthly" } = req.body;
  if (!PLATFORM_PLANS[tier]) return next(new AppError("Invalid tier.", 400));
  if (!["monthly", "yearly"].includes(billingCycle)) return next(new AppError("Invalid billingCycle.", 400));

  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId);
  if (!gym) return next(new AppError("Gym not found.", 404));

  const amount = PLATFORM_PLANS[tier][billingCycle];
  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: `billing_${Date.now()}`,
    notes: { gymId: gymId.toString(), tier, billingCycle, type: "saas_subscription" },
  });

  res.json({
    success: true,
    data: { orderId: order.id, amount: order.amount, currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID, tier, billingCycle, gymName: gym.name },
  });
});

// POST /api/billing/verify
exports.verifySubscription = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier = "starter", billingCycle = "monthly" } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return next(new AppError("Missing payment verification fields.", 400));
  }

  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSig !== razorpay_signature) {
    return next(new AppError("Payment verification failed. Invalid signature.", 400));
  }

  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const amount = PLATFORM_PLANS[tier]?.[billingCycle] || PLATFORM_PLANS.starter.monthly;
  const gym = await billingService.activateSubscription(gymId, tier, billingCycle, razorpay_payment_id, amount);

  res.json({
    success: true,
    message: `Subscription activated! Your gym is now on the ${tier} plan.`,
    data: { tier, billingCycle, expiryDate: gym.subscription?.expiryDate, gymStatus: gym.status },
  });
});

// POST /api/billing/cancel
exports.cancelSubscription = asyncHandler(async (req, res, next) => {
  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId);
  if (!gym) return next(new AppError("Gym not found.", 404));

  const { reason = "" } = req.body;
  const now = new Date();

  gym.subscription = gym.subscription || {};
  gym.subscription.status = "cancelled";
  await gym.save();

  await SaaSSubscription.findOneAndUpdate(
    { gym: gymId },
    { status: "cancelled", cancelledAt: now, cancelReason: reason },
    { upsert: false }
  );

  res.json({ success: true, message: "Subscription cancelled successfully.", data: { cancelledAt: now, reason } });
});

// POST /api/billing/upgrade
exports.upgradeSubscription = asyncHandler(async (req, res, next) => {
  if (!razorpay) return next(new AppError("Razorpay not configured.", 503));

  const { newTier, billingCycle = "monthly" } = req.body;
  if (!newTier || !PLATFORM_PLANS[newTier]) return next(new AppError("Invalid tier.", 400));

  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId);
  if (!gym) return next(new AppError("Gym not found.", 404));

  const proratedAmount = await billingService.calculateProratedCharge(gymId, newTier);

  if (proratedAmount <= 0) {
    await billingService.activateSubscription(gymId, newTier, billingCycle, "upgrade_no_charge", 0);
    return res.json({ success: true, message: `Upgraded to ${newTier} plan.`, data: { tier: newTier, billingCycle, proratedAmount: 0 } });
  }

  const order = await razorpay.orders.create({
    amount: proratedAmount * 100,
    currency: "INR",
    receipt: `upgrade_${Date.now()}`,
    notes: { gymId: gymId.toString(), newTier, billingCycle, type: "saas_upgrade" },
  });

  res.json({
    success: true,
    data: { orderId: order.id, amount: order.amount, currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID, newTier, billingCycle, proratedAmount, gymName: gym.name },
  });
});
