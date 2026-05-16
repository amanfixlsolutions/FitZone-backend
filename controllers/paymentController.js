const Stripe = require("stripe");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const Plan = require("../models/Plan");
const Gym = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { generateInvoiceNumber } = require("../utils/invoiceNumber");
const { sendPaymentConfirmation } = require("../services/emailService");
const { createNotification } = require("../services/notificationService");
const { applyGymScope, findMemberForUser, getTenantGymId, assertSameTenant } = require("../utils/tenantFilter");

// ── Initialize payment gateways ────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

// ─────────────────────────────────────────────────────────────────
// @GET /api/payments
// ─────────────────────────────────────────────────────────────────
exports.getPayments = asyncHandler(async (req, res) => {
  const { status, type, memberId, from, to } = req.query;
  const filter = applyGymScope({}, req);

  if (status)   filter.status = status;
  if (type)     filter.type = type;
  if (memberId) filter.member = memberId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to)   filter.createdAt.$lte = new Date(to);
  }

  const total = await Payment.countDocuments(filter);
  const { query, pagination } = paginate(
    Payment.find(filter).populate("member", "name email").sort({ createdAt: -1 }),
    req.query
  );

  const payments = await query;
  res.json({
    success: true,
    data: payments,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/create-order
// Create Razorpay order (step 1 of payment)
// ─────────────────────────────────────────────────────────────────
exports.createRazorpayOrder = asyncHandler(async (req, res, next) => {
  const { planId, memberId, amount } = req.body;

  if (!razorpay) return next(new AppError("Razorpay not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.", 503));

  const plan = await Plan.findById(planId);
  if (!plan) return next(new AppError("Plan not found.", 404));

  // Resolve memberId — for logged-in members, find their member record
  let resolvedMemberId = memberId;
  if (!resolvedMemberId && req.user) {
    const member = await findMemberForUser(req.user, Member);
    if (member) resolvedMemberId = member._id;
  }

  if (req.user?.role === "member" && plan.gym && getTenantGymId(req.user)) {
    if (String(plan.gym) !== String(getTenantGymId(req.user))) {
      return next(new AppError("This plan does not belong to your gym.", 403));
    }
  }

  // ── Downgrade prevention ───────────────────────────────────────
  // If member already has an active plan, new plan price must be >= current plan price
  if (resolvedMemberId) {
    const existingMember = await Member.findById(resolvedMemberId).populate("plan", "price name");
    if (existingMember?.plan && existingMember.planPrice > 0) {
      const currentPrice = existingMember.planPrice;
      if (plan.price < currentPrice) {
        return next(new AppError(
          `You cannot downgrade from your current plan (₹${currentPrice}) to a lower plan (₹${plan.price}). You can only upgrade to a higher plan.`,
          400
        ));
      }
    }
  } else if (req.user) {
    // Check via User model planId
    const User = require("../models/User");
    const userRecord = await User.findById(req.user._id).populate("planId", "price name");
    if (userRecord?.planId?.price && plan.price < userRecord.planId.price) {
      return next(new AppError(
        `You cannot downgrade from your current plan (₹${userRecord.planId.price}) to a lower plan (₹${plan.price}). You can only upgrade to a higher plan.`,
        400
      ));
    }
  }

  const orderAmount = amount || plan.price;

  const order = await razorpay.orders.create({
    amount:   orderAmount * 100, // paise
    currency: "INR",
    receipt:  `receipt_${Date.now()}`,
    notes:    { planId, memberId: resolvedMemberId?.toString() || "", planName: plan.name },
  });

  res.json({
    success: true,
    data: {
      orderId:    order.id,
      amount:     order.amount,
      currency:   order.currency,
      keyId:      process.env.RAZORPAY_KEY_ID,
      planName:   plan.name,
      planPrice:  plan.price,
      memberId:   resolvedMemberId,
    },
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/verify-razorpay
// Verify Razorpay payment signature (step 2)
// ─────────────────────────────────────────────────────────────────
exports.verifyRazorpay = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, memberId, planId } = req.body;

  // Verify signature
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSig !== razorpay_signature) {
    return next(new AppError("Payment verification failed. Invalid signature.", 400));
  }

  // Process the payment — pass req.user so we can auto-create member if needed
  await processPayment({
    memberId, planId,
    gateway: "Razorpay",
    gatewayPaymentId: razorpay_payment_id,
    gatewayOrderId: razorpay_order_id,
    user: req.user,
    req, res, next,
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/create-stripe-intent
// Create Stripe PaymentIntent
// ─────────────────────────────────────────────────────────────────
exports.createStripeIntent = asyncHandler(async (req, res, next) => {
  const { planId, memberId } = req.body;

  if (!stripe) return next(new AppError("Stripe not configured.", 503));

  const plan = await Plan.findById(planId);
  if (!plan) return next(new AppError("Plan not found.", 404));

  const intent = await stripe.paymentIntents.create({
    amount:   plan.price * 100, // cents/paise
    currency: "inr",
    metadata: { planId, memberId, planName: plan.name },
  });

  res.json({
    success: true,
    data: {
      clientSecret:    intent.client_secret,
      publishableKey:  process.env.STRIPE_PUBLISHABLE_KEY,
      amount:          plan.price,
      planName:        plan.name,
    },
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/confirm-stripe
// Confirm Stripe payment after frontend confirms
// ─────────────────────────────────────────────────────────────────
exports.confirmStripe = asyncHandler(async (req, res, next) => {
  const { paymentIntentId, memberId, planId } = req.body;

  if (!stripe) return next(new AppError("Stripe not configured.", 503));

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded") {
    return next(new AppError("Payment not completed.", 400));
  }

  await processPayment({
    memberId, planId,
    gateway: "Stripe",
    gatewayPaymentId: paymentIntentId,
    gatewayOrderId: intent.id,
    req, res, next,
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/manual
// Manual/Cash payment (admin records it)
// ─────────────────────────────────────────────────────────────────
exports.createManualPayment = asyncHandler(async (req, res, next) => {
  const { memberId, planId, gateway = "Cash", description } = req.body;

  await processPayment({
    memberId, planId, gateway, description,
    user: req.user,
    req, res, next,
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/stripe-webhook
// Stripe webhook handler
// ─────────────────────────────────────────────────────────────────
exports.stripeWebhook = asyncHandler(async (req, res, next) => {
  if (!stripe) return res.json({ received: true });

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return next(new AppError(`Webhook error: ${err.message}`, 400));
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const { memberId, planId } = intent.metadata;
    if (memberId && planId) {
      await processPayment({
        memberId, planId,
        gateway: "Stripe",
        gatewayPaymentId: intent.id,
        gatewayOrderId: intent.id,
        fromWebhook: true,
      });
    }
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/payments/razorpay-webhook
// Razorpay webhook handler with HMAC-SHA256 signature verification
// ─────────────────────────────────────────────────────────────────
exports.razorpayWebhook = asyncHandler(async (req, res, next) => {
  const sig = req.headers["x-razorpay-signature"];
  if (!sig) return next(new AppError("Missing Razorpay signature.", 400));

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.json({ received: true }); // not configured — skip

  // HMAC-SHA256 verification
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (expectedSig !== sig) {
    return next(new AppError("Invalid Razorpay webhook signature.", 400));
  }

  const event = req.body;
  if (event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    if (payment?.notes?.planId && payment?.notes?.memberId) {
      await processPayment({
        memberId: payment.notes.memberId,
        planId:   payment.notes.planId,
        gateway:  "Razorpay",
        gatewayPaymentId: payment.id,
        gatewayOrderId:   payment.order_id || "",
        fromWebhook: true,
      }).catch(() => {});
    }
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────
// @GET /api/payments/revenue
// Revenue stats for dashboard
// ─────────────────────────────────────────────────────────────────
exports.getRevenueStats = asyncHandler(async (req, res) => {
  const gymFilter = req.user.role === "gym-owner" ? { gym: req.user.gym } : {};
  const successFilter = { ...gymFilter, status: "Success" };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear  = new Date(now.getFullYear(), 0, 1);

  const [totalRes, monthRes, yearRes] = await Promise.all([
    Payment.aggregate([{ $match: successFilter }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Payment.aggregate([{ $match: { ...successFilter, createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Payment.aggregate([{ $match: { ...successFilter, createdAt: { $gte: startOfYear } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);

  // Monthly chart (last 12 months)
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const result = await Payment.aggregate([
      { $match: { ...successFilter, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, revenue: { $sum: "$amount" } } },
    ]);
    monthly.push({
      month:   start.toLocaleString("default", { month: "short" }),
      revenue: result[0]?.revenue || 0,
    });
  }

  res.json({
    success: true,
    data: {
      total:   totalRes[0]?.total || 0,
      monthly: monthRes[0]?.total || 0,
      yearly:  yearRes[0]?.total  || 0,
      chart:   monthly,
    },
  });
});

// ─────────────────────────────────────────────────────────────────
// Internal: process payment, update member, create invoice
// ─────────────────────────────────────────────────────────────────
async function processPayment({ memberId, planId, gateway, gatewayPaymentId = "", gatewayOrderId = "", description = "", fromWebhook = false, user, req, res, next }) {
  const plan = await Plan.findById(planId);
  if (!plan) {
    if (!fromWebhook && typeof next === "function") return next(new AppError("Plan not found.", 404));
    return;
  }

  // ── Resolve member — find existing or auto-create ──────────────
  let member = null;

  // 1. Try by memberId
  if (memberId) {
    member = await Member.findById(memberId).catch(() => null);
  }

  // 2. Try by logged-in user — scoped to their gym only
  if (!member && user) {
    member = await findMemberForUser(user, Member);
  }

  if (member && user?.role === "member") {
    assertSameTenant(user, member);
  }

  if (plan.gym && member && String(plan.gym) !== String(member.gym)) {
    if (!fromWebhook && typeof next === "function") {
      return next(new AppError("This plan does not belong to your gym.", 403));
    }
    return;
  }

  if (!member) {
    if (!fromWebhook && typeof next === "function") {
      return next(new AppError("Member not found. Please contact support.", 404));
    }
    return;
  }

  // Get gym settings for commission rate
  const gym = await Gym.findById(member.gym);
  const commissionRate   = gym?.commissionRate || 10;
  const commissionAmount = (plan.price * commissionRate) / 100;
  const netAmount        = plan.price - commissionAmount;

  // Create payment record
  const payment = await Payment.create({
    gym:              member.gym,
    member:           member._id,        // use resolved member._id
    plan:             planId,
    memberName:       member.name,
    planName:         plan.name,
    gymName:          gym?.name || "",
    amount:           plan.price,
    gateway,
    gatewayPaymentId,
    gatewayOrderId,
    description,
    status:           "Success",
    commissionRate,
    commissionAmount,
    netAmount,
    paidAt:           new Date(),
  });

  // Calculate expiry date
  const durationMs = getDurationMs(plan.duration, plan.unit);
  const expiryDate = new Date(Date.now() + durationMs);

  // Update member plan & status
  await Member.findByIdAndUpdate(member._id, {
    plan:       planId,
    planName:   plan.name,
    planPrice:  plan.price,
    expiryDate,
    status:     "Active",
  });

  // Also update the User record so navbar shows correct plan
  if (member.user) {
    const User = require("../models/User");
    await User.findByIdAndUpdate(member.user, {
      plan:       plan.name,
      planExpiry: expiryDate,
      planId:     planId,
    });
  } else if (user) {
    const User = require("../models/User");
    await User.findByIdAndUpdate(user._id, {
      plan:       plan.name,
      planExpiry: expiryDate,
      planId:     planId,
    });
  }

  // Update plan subscriber count
  await Plan.findByIdAndUpdate(planId, { $inc: { totalSubscribers: 1, activeSubscribers: 1 } });

  // Update gym revenue
  await Gym.findByIdAndUpdate(member.gym, {
    $inc: { totalRevenue: plan.price, monthlyRevenue: plan.price },
  });

  // Auto-generate invoice
  const invoiceNumber = await generateInvoiceNumber();
  const invoice = await Invoice.create({
    gym:          member.gym,
    member:       member._id,            // use resolved member._id
    plan:         planId,
    invoiceNumber,
    memberName:   member.name,
    memberEmail:  member.email,
    gymName:      gym?.name || "",
    planName:     plan.name,
    items: [{
      description: `${plan.name} Membership (${plan.duration} ${plan.unit})`,
      quantity:    1,
      unitPrice:   plan.price,
      total:       plan.price,
    }],
    subtotal: plan.price,
    total:    plan.price,
    status:   "Paid",
    paidAt:   new Date(),
  });

  payment.invoiceId = invoice._id;
  await payment.save();

  // Send confirmation email
  try { await sendPaymentConfirmation(member, payment); } catch (_) {}

  // Award 'Loyal Member' badge on plan renewal (non-blocking)
  try {
    const { awardBadge } = require("../services/achievementService");
    await awardBadge(member._id, "Loyal Member");
  } catch (_) { /* non-blocking */ }

  // Notify gym
  await createNotification({
    gym:      member.gym,
    title:    "Payment Received",
    message:  `₹${plan.price} received from ${member.name} for ${plan.name}`,
    type:     "payment",
    audience: "specific-gym",
  }).catch(() => {});

  if (!fromWebhook && res) {
    res.status(201).json({ success: true, data: payment, invoice });
  }
}

function getDurationMs(duration, unit) {
  const map = {
    Day: 86400000, Days: 86400000,
    Month: 2592000000, Months: 2592000000,
    Year: 31536000000, Years: 31536000000,
  };
  return (map[unit] || 2592000000) * duration;
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM SUBSCRIPTION — Gym pays FitZone to activate/renew
// ─────────────────────────────────────────────────────────────────

// Platform plan config
const PLATFORM_PLANS = {
  Basic:        { monthly: 999,  yearly: 9590  },
  Professional: { monthly: 2499, yearly: 23990 },
  Enterprise:   { monthly: 4999, yearly: 47990 },
};

// @POST /api/payments/gym-subscription/create-order
exports.createGymSubscriptionOrder = asyncHandler(async (req, res, next) => {
  if (!razorpay) return next(new AppError("Razorpay not configured.", 503));

  const { plan = "Basic", billingCycle = "monthly" } = req.body;

  if (!PLATFORM_PLANS[plan]) return next(new AppError("Invalid plan selected.", 400));

  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId);
  if (!gym) return next(new AppError("Gym not found.", 404));

  const amount = PLATFORM_PLANS[plan][billingCycle] || PLATFORM_PLANS[plan].monthly;

  const order = await razorpay.orders.create({
    amount:   amount * 100,
    currency: "INR",
    receipt:  `gym_sub_${Date.now()}`,
    notes:    {
      gymId:        gymId.toString(),
      plan,
      billingCycle,
      type:         "gym_subscription",
    },
  });

  res.json({
    success: true,
    data: {
      orderId:      order.id,
      amount:       order.amount,
      currency:     order.currency,
      keyId:        process.env.RAZORPAY_KEY_ID,
      plan,
      billingCycle,
      gymName:      gym.name,
    },
  });
});

// @POST /api/payments/gym-subscription/verify
exports.verifyGymSubscription = asyncHandler(async (req, res, next) => {
  const {
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
    plan = "Basic", billingCycle = "monthly",
  } = req.body;

  // Verify signature
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSig !== razorpay_signature) {
    return next(new AppError("Payment verification failed. Invalid signature.", 400));
  }

  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId);
  if (!gym) return next(new AppError("Gym not found.", 404));

  const amount = PLATFORM_PLANS[plan]?.[billingCycle] || 999;

  // Calculate expiry
  const now = new Date();
  const startDate = now;
  const expiryDate = billingCycle === "yearly"
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // Update gym subscription + activate gym
  gym.subscription = {
    plan,
    status:       "active",
    billingCycle,
    startDate,
    expiryDate,
    autoRenew:    true,
    lastPaymentId:     razorpay_payment_id,
    lastPaymentAmount: amount,
    lastPaidAt:        now,
  };
  gym.status = "active";
  if (!gym.approvedAt) {
    gym.approvedAt = now;
    gym.approvedBy = req.user._id;
  }
  await gym.save();

  // Log activity
  const ActivityLog = require("../models/ActivityLog");
  await ActivityLog.create({
    user:     req.user._id,
    userName: req.user.name,
    role:     req.user.role,
    action:   "GYM_SUBSCRIPTION_PAYMENT",
    module:   "Payments",
    details:  `Gym "${gym.name}" subscribed to ${plan} (${billingCycle}) — ₹${amount}`,
  }).catch(() => {});

  // Notify super-admin
  const { createNotification: cn } = require("../services/notificationService");
  await cn({
    sender:   req.user._id,
    title:    "Gym Subscription Payment",
    message:  `${gym.name} subscribed to ${plan} plan (${billingCycle}) — ₹${amount}`,
    type:     "payment",
    audience: "super-admin",
  }).catch(() => {});

  res.json({
    success: true,
    message: `Subscription activated! Your gym is now live on ${plan} plan.`,
    data: {
      plan,
      billingCycle,
      expiryDate,
      gymStatus: gym.status,
    },
  });
});

// @GET /api/payments/gym-subscription/status
exports.getGymSubscriptionStatus = asyncHandler(async (req, res, next) => {
  const gymId = req.user.gym;
  if (!gymId) return next(new AppError("No gym linked to your account.", 400));

  const gym = await Gym.findById(gymId).select("name status subscription");
  if (!gym) return next(new AppError("Gym not found.", 404));

  res.json({
    success: true,
    data: {
      gymStatus:    gym.status,
      subscription: gym.subscription || {},
    },
  });
});
