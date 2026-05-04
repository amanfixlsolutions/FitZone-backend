const Plan = require("../models/Plan");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");

// ── @GET /api/plans ────────────────────────────────────────────────
exports.getPlans = asyncHandler(async (req, res) => {
  const { includeInactive, gymId } = req.query;
  const filter = {};

  // Public access (no auth) — show only active platform-wide plans
  if (!req.user) {
    filter.active = true;
    filter.gym    = null; // platform-wide plans only
  } else if (req.user.role === "gym-owner") {
    filter.$or    = [{ gym: req.user.gym }, { gym: null }];
    filter.active = true;
  } else if (gymId) {
    filter.$or = [{ gym: gymId }, { gym: null }];
    if (!includeInactive) filter.active = true;
  } else {
    if (!includeInactive) filter.active = true;
  }

  const plans = await Plan.find(filter)
    .populate("addedBy", "name email")
    .sort({ price: 1 });
  res.json({ success: true, data: plans });
});

// ── @GET /api/plans/:id ────────────────────────────────────────────
exports.getPlan = asyncHandler(async (req, res, next) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) return next(new AppError("Plan not found.", 404));
  res.json({ success: true, data: plan });
});

// ── @POST /api/plans ───────────────────────────────────────────────
exports.createPlan = asyncHandler(async (req, res) => {
  const gymId = req.user.role === "gym-owner" ? req.user.gym : (req.body.gym || null);

  const plan = await Plan.create({
    ...req.body,
    gym: gymId,
    addedBy: req.user._id,
  });

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "CREATE_PLAN", module: "Plans",
    details: `Created plan: ${plan.name} - ₹${plan.price}`,
  });

  // ── Notification ──────────────────────────────────────────────
  if (gymId) {
    await createNotification({
      gym:      gymId,
      sender:   req.user._id,
      title:    "New Membership Plan Created",
      message:  `"${plan.name}" plan (₹${plan.price}/${plan.duration} ${plan.unit}) is now available.`,
      type:     "payment",
      audience: "specific-gym",
    }).catch(() => {});
  } else {
    // Platform-wide plan — notify super-admin
    await createNotification({
      sender:   req.user._id,
      title:    "New Platform Plan Created",
      message:  `"${plan.name}" plan (₹${plan.price}/${plan.duration} ${plan.unit}) added to platform.`,
      type:     "payment",
      audience: "super-admin",
    }).catch(() => {});
  }

  res.status(201).json({ success: true, data: plan });
});

// ── @PUT /api/plans/:id ────────────────────────────────────────────
exports.updatePlan = asyncHandler(async (req, res, next) => {
  const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!plan) return next(new AppError("Plan not found.", 404));

  // ── Notification ──────────────────────────────────────────────
  if (plan.gym) {
    await createNotification({
      gym:      plan.gym,
      sender:   req.user._id,
      title:    "Membership Plan Updated",
      message:  `"${plan.name}" plan has been updated to ₹${plan.price}.`,
      type:     "payment",
      audience: "specific-gym",
    }).catch(() => {});
  }

  res.json({ success: true, data: plan });
});

// ── @DELETE /api/plans/:id ─────────────────────────────────────────
exports.deletePlan = asyncHandler(async (req, res, next) => {
  const plan = await Plan.findByIdAndDelete(req.params.id);
  if (!plan) return next(new AppError("Plan not found.", 404));

  // ── Notification ──────────────────────────────────────────────
  if (plan.gym) {
    await createNotification({
      gym:      plan.gym,
      sender:   req.user._id,
      title:    "Membership Plan Removed",
      message:  `"${plan.name}" plan has been deleted.`,
      type:     "alert",
      audience: "specific-gym",
    }).catch(() => {});
  }

  res.json({ success: true, message: "Plan deleted." });
});

// ── @PATCH /api/plans/:id/toggle ──────────────────────────────────
exports.togglePlan = asyncHandler(async (req, res, next) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) return next(new AppError("Plan not found.", 404));
  plan.active = !plan.active;
  await plan.save();
  res.json({ success: true, data: plan, message: `Plan ${plan.active ? "activated" : "deactivated"}.` });
});
