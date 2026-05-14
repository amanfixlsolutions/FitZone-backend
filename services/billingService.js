/**
 * billingService.js — SaaS Subscription Lifecycle Management
 */

const Gym = require("../models/Gym");
const SaaSSubscription = require("../models/SaaSSubscription");
const PlatformInvoice = require("../models/PlatformInvoice");
const { generateInvoiceNumber } = require("../utils/invoiceNumber");
const logger = require("../utils/logger");

const TIER_PRICES = {
  starter:    { monthly: 999,  yearly: 9590  },
  growth:     { monthly: 2499, yearly: 23990 },
  enterprise: { monthly: 4999, yearly: 47990 },
};

// ── startTrial ─────────────────────────────────────────────────────
exports.startTrial = async (gymId, durationDays = 14) => {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const gym = await Gym.findById(gymId);
  if (!gym) throw new Error(`Gym not found: ${gymId}`);

  gym.subscription = gym.subscription || {};
  gym.subscription.status = "trial";
  gym.subscription.expiryDate = trialEndsAt;
  gym.subscription.trialStartedAt = now;
  gym.trialEndsAt = trialEndsAt;
  await gym.save();

  await SaaSSubscription.findOneAndUpdate(
    { gym: gymId },
    { gym: gymId, gymName: gym.name, status: "trial", tier: gym.subscriptionTier || "starter",
      trialStartedAt: now, trialEndsAt, trialDays: durationDays },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info(`Trial started for gym "${gym.name}" — ends ${trialEndsAt.toISOString()}`);
  return gym;
};

// ── activateSubscription ───────────────────────────────────────────
exports.activateSubscription = async (gymId, tier, billingCycle, paymentId, amount) => {
  const now = new Date();
  const expiryDate = billingCycle === "yearly"
    ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 30  * 24 * 60 * 60 * 1000);

  const gym = await Gym.findById(gymId);
  if (!gym) throw new Error(`Gym not found: ${gymId}`);

  gym.subscriptionTier = tier;
  gym.subscription = gym.subscription || {};
  gym.subscription.status = "active";
  gym.subscription.billingCycle = billingCycle;
  gym.subscription.expiryDate = expiryDate;
  gym.subscription.lastPaymentId = paymentId;
  gym.subscription.lastPaymentAmount = amount;
  gym.subscription.lastPaidAt = now;
  await gym.save();

  await SaaSSubscription.findOneAndUpdate(
    { gym: gymId },
    { gym: gymId, gymName: gym.name, tier, status: "active", billingCycle,
      currentPeriodStart: now, currentPeriodEnd: expiryDate, nextBillingDate: expiryDate,
      amount, lastPaymentId: paymentId, lastPaymentAmount: amount, lastPaidAt: now,
      dunningStep: 0, dunningStartedAt: null, nextDunningAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await exports.generatePlatformInvoice(gymId, paymentId, amount, tier, billingCycle);
  logger.info(`Subscription activated for gym "${gym.name}" — tier: ${tier}`);
  return gym;
};

// ── handlePaymentFailure ───────────────────────────────────────────
exports.handlePaymentFailure = async (gymId) => {
  const now = new Date();
  const gym = await Gym.findById(gymId).populate("owner");
  if (!gym) throw new Error(`Gym not found: ${gymId}`);

  gym.subscription = gym.subscription || {};
  gym.subscription.status = "expired";
  await gym.save();

  await SaaSSubscription.findOneAndUpdate(
    { gym: gymId },
    { status: "payment_failed", dunningStep: 1, dunningStartedAt: now,
      nextDunningAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (gym.owner) {
    try {
      const { sendDunningDay0 } = require("./emailService");
      await sendDunningDay0(gym.owner, gym.name);
    } catch (err) {
      logger.warn(`Dunning Day 0 email failed for gym ${gymId}: ${err.message}`);
    }
  }

  logger.info(`Payment failure recorded for gym "${gym.name}"`);
  return gym;
};

// ── runDunningSequence ─────────────────────────────────────────────
exports.runDunningSequence = async (gymId) => {
  const now = new Date();
  const sub = await SaaSSubscription.findOne({ gym: gymId });
  if (!sub || !sub.dunningStartedAt) return { skipped: true };

  const daysSinceStart = (now - sub.dunningStartedAt) / (1000 * 60 * 60 * 24);
  const gym = await Gym.findById(gymId).populate("owner");
  if (!gym) return { skipped: true };

  if (sub.dunningStep === 1 && daysSinceStart >= 3) {
    sub.dunningStep = 2;
    sub.nextDunningAt = new Date(sub.dunningStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await sub.save();
    if (gym.owner) {
      try { const { sendDunningDay3 } = require("./emailService"); await sendDunningDay3(gym.owner, gym.name); } catch (_) {}
    }
    return { step: 2, action: "day3_email_sent" };
  }

  if (sub.dunningStep === 2 && daysSinceStart >= 7) {
    sub.dunningStep = 3;
    sub.status = "expired";
    await sub.save();
    gym.status = "suspended";
    await gym.save();
    if (gym.owner) {
      try { const { sendDunningDay7 } = require("./emailService"); await sendDunningDay7(gym.owner, gym.name); } catch (_) {}
    }
    return { step: 3, action: "gym_suspended" };
  }

  return { skipped: true, step: sub.dunningStep };
};

// ── calculateProratedCharge ────────────────────────────────────────
exports.calculateProratedCharge = async (gymId, newTier) => {
  const sub = await SaaSSubscription.findOne({ gym: gymId });
  if (!sub) throw new Error("No subscription found");

  const now = new Date();
  const periodEnd = sub.currentPeriodEnd || sub.nextBillingDate;
  if (!periodEnd) throw new Error("No billing period end date");

  const totalDays = sub.billingCycle === "yearly" ? 365 : 30;
  const daysRemaining = Math.max(0, (periodEnd - now) / (1000 * 60 * 60 * 24));
  const priceDiff = (TIER_PRICES[newTier]?.monthly || 0) - (TIER_PRICES[sub.tier]?.monthly || 0);

  if (priceDiff <= 0) return 0;
  return Math.round((priceDiff * daysRemaining) / totalDays);
};

// ── calculateYearlyPrice ───────────────────────────────────────────
exports.calculateYearlyPrice = (monthlyPrice, discountRate = 20) => {
  return monthlyPrice * 12 * (1 - discountRate / 100);
};

// ── checkAndExpireSubscriptions ────────────────────────────────────
exports.checkAndExpireSubscriptions = async () => {
  const now = new Date();
  let expired = 0;
  let trialExpired = 0;

  const expiredGyms = await Gym.find({
    "subscription.expiryDate": { $lt: now },
    "subscription.status": "active",
  });

  for (const gym of expiredGyms) {
    try {
      const gracePeriodEndsAt = new Date((gym.subscription.expiryDate || now).getTime() + 7 * 24 * 60 * 60 * 1000);
      gym.subscription.status = "expired";
      gym.subscription.gracePeriodEndsAt = gracePeriodEndsAt;
      await gym.save();
      await SaaSSubscription.findOneAndUpdate({ gym: gym._id }, { status: "grace_period", gracePeriodEndsAt }, { upsert: false });
      expired++;
    } catch (err) {
      logger.error(`Failed to expire subscription for gym ${gym._id}: ${err.message}`);
    }
  }

  const expiredTrialGyms = await Gym.find({
    trialEndsAt: { $lt: now },
    "subscription.status": "trial",
  });

  for (const gym of expiredTrialGyms) {
    try {
      await exports.handlePaymentFailure(gym._id);
      trialExpired++;
    } catch (err) {
      logger.error(`Failed to handle trial expiry for gym ${gym._id}: ${err.message}`);
    }
  }

  const dunningGyms = await SaaSSubscription.find({ status: "payment_failed", dunningStep: { $in: [1, 2] } });
  for (const sub of dunningGyms) {
    try { await exports.runDunningSequence(sub.gym); } catch (_) {}
  }

  return { expired, trialExpired };
};

// ── generatePlatformInvoice ────────────────────────────────────────
exports.generatePlatformInvoice = async (gymId, paymentId, amount, tier, billingCycle) => {
  const gym = await Gym.findById(gymId);
  if (!gym) throw new Error(`Gym not found: ${gymId}`);

  const invoiceNumber = await generateInvoiceNumber();
  const now = new Date();
  const periodEnd = billingCycle === "yearly"
    ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 30  * 24 * 60 * 60 * 1000);

  const invoice = await PlatformInvoice.create({
    gym: gymId, gymName: gym.name, invoiceNumber, tier, billingCycle,
    amount, currency: "INR", status: "paid", gateway: "Razorpay",
    gatewayPaymentId: paymentId, periodStart: now, periodEnd, paidAt: now,
  });

  logger.info(`Platform invoice ${invoiceNumber} generated for gym "${gym.name}"`);
  return invoice;
};

// ── startDailyCronJob ──────────────────────────────────────────────
exports.startDailyCronJob = () => {
  if (process.env.NODE_ENV === "test") {
    logger.info("Billing cron job skipped in test environment");
    return;
  }

  const cron = require("node-cron");
  cron.schedule("0 2 * * *", async () => {
    logger.info("Billing cron: running checkAndExpireSubscriptions…");
    try {
      const result = await exports.checkAndExpireSubscriptions();
      logger.info(`Billing cron: ${result.expired} expired, ${result.trialExpired} trials expired`);
    } catch (err) {
      logger.error(`Billing cron failed: ${err.message}`);
    }
  });

  logger.info("Billing cron job scheduled (daily at 2 AM)");
};
