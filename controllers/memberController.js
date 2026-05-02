const Member = require("../models/Member");
const Plan = require("../models/Plan");
const Gym = require("../models/Gym");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { generateMemberQR } = require("../services/qrService");
const { sendWelcomeEmail } = require("../services/emailService");
const { createNotification } = require("../services/notificationService");

// ── @GET /api/members ──────────────────────────────────────────────
exports.getMembers = asyncHandler(async (req, res) => {
  const { status, plan, search, gymId } = req.query;
  const filter = {};

  // Gym owner sees only their gym's members
  if (req.user.role === "gym-owner") filter.gym = req.user.gym;
  else if (gymId) filter.gym = gymId;

  if (status) filter.status = status;
  if (plan)   filter.planName = new RegExp(plan, "i");
  if (search) filter.$or = [
    { name: new RegExp(search, "i") },
    { email: new RegExp(search, "i") },
    { phone: new RegExp(search, "i") },
  ];

  const total = await Member.countDocuments(filter);
  const { query, pagination } = paginate(
    Member.find(filter).populate("plan", "name price").populate("gym", "name city").sort({ createdAt: -1 }),
    req.query
  );

  const members = await query;
  res.json({
    success: true,
    data: members,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/members/:id ──────────────────────────────────────────
exports.getMember = asyncHandler(async (req, res, next) => {
  const member = await Member.findById(req.params.id).populate("plan gym");
  if (!member) return next(new AppError("Member not found.", 404));
  res.json({ success: true, data: member });
});

// ── @POST /api/members ─────────────────────────────────────────────
exports.createMember = asyncHandler(async (req, res, next) => {
  let gymId = req.user.role === "gym-owner" ? req.user.gym : req.body.gym;

  // Fallback: if gym-owner's gym ref is missing, fetch from DB
  if (!gymId && req.user.role === "gym-owner") {
    const Gym = require("../models/Gym");
    const gym = await Gym.findOne({ owner: req.user._id });
    if (gym) gymId = gym._id;
  }

  if (!gymId) return next(new AppError("Gym ID is required.", 400));

  // Get plan details
  let planName = req.body.planName || "";
  let planPrice = 0;
  let expiryDate = null;

  if (req.body.plan) {
    const plan = await Plan.findById(req.body.plan);
    if (plan) {
      planName = plan.name;
      planPrice = plan.price;
      // Calculate expiry
      const now = new Date();
      const durationMs = plan.duration * getDurationMs(plan.unit);
      expiryDate = new Date(now.getTime() + durationMs);
      // Update plan subscriber count
      await Plan.findByIdAndUpdate(plan._id, { $inc: { totalSubscribers: 1, activeSubscribers: 1 } });
    }
  }

  // Generate QR
  const { qrId, qrCode } = await generateMemberQR(req.body.email);

  const member = await Member.create({
    ...req.body,
    gym: gymId,
    addedBy: req.user._id,
    planName,
    planPrice,
    expiryDate,
    qrId,
    qrCode,
  });

  // Update gym member count
  await Gym.findByIdAndUpdate(gymId, { $inc: { totalMembers: 1, activeMembers: 1 } });

  // Send welcome email
  try { await sendWelcomeEmail(member); } catch (_) {}

  // Notify gym owner
  await createNotification({
    gym: gymId,
    title: "New Member Joined",
    message: `${member.name} joined with ${planName} plan`,
    type: "member",
    audience: "specific-gym",
  });

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "ADD_MEMBER", module: "Members",
    details: `Added member: ${member.name}`,
    data: { memberId: member._id },
  });

  res.status(201).json({ success: true, data: member });
});

// ── @PUT /api/members/:id ──────────────────────────────────────────
exports.updateMember = asyncHandler(async (req, res, next) => {
  const member = await Member.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!member) return next(new AppError("Member not found.", 404));
  res.json({ success: true, data: member });
});

// ── @DELETE /api/members/:id ───────────────────────────────────────
exports.deleteMember = asyncHandler(async (req, res, next) => {
  const member = await Member.findByIdAndDelete(req.params.id);
  if (!member) return next(new AppError("Member not found.", 404));

  await Gym.findByIdAndUpdate(member.gym, { $inc: { totalMembers: -1, activeMembers: -1 } });

  await createNotification({
    gym:      member.gym,
    sender:   req.user._id,
    title:    "Member Removed",
    message:  `${member.name}'s membership has been removed.`,
    type:     "member",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Member deleted." });
});

// ── @POST /api/members/:id/ban ─────────────────────────────────────
exports.banMember = asyncHandler(async (req, res, next) => {
  const member = await Member.findByIdAndUpdate(
    req.params.id, { status: "Banned" }, { new: true }
  );
  if (!member) return next(new AppError("Member not found.", 404));

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "BAN_MEMBER", module: "Members",
    details: `Banned member: ${member.name}`,
  });

  await createNotification({
    gym:      member.gym,
    sender:   req.user._id,
    title:    "Member Banned",
    message:  `${member.name} has been banned from the gym.`,
    type:     "alert",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Member banned.", data: member });
});

// ── @POST /api/members/:id/unban ───────────────────────────────────
exports.unbanMember = asyncHandler(async (req, res, next) => {
  const member = await Member.findByIdAndUpdate(
    req.params.id, { status: "Active" }, { new: true }
  );
  if (!member) return next(new AppError("Member not found.", 404));

  await createNotification({
    gym:      member.gym,
    sender:   req.user._id,
    title:    "Member Unbanned",
    message:  `${member.name} has been unbanned and is now active.`,
    type:     "member",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Member unbanned.", data: member });
});

// ── @GET /api/members/:id/qr ───────────────────────────────────────
exports.getMemberQR = asyncHandler(async (req, res, next) => {
  const member = await Member.findById(req.params.id);
  if (!member) return next(new AppError("Member not found.", 404));

  if (!member.qrCode) {
    const { qrId, qrCode } = await generateMemberQR(member._id);
    member.qrId = qrId;
    member.qrCode = qrCode;
    await member.save();
  }

  res.json({ success: true, data: { qrCode: member.qrCode, qrId: member.qrId } });
});

// ── @GET /api/members/stats ────────────────────────────────────────
exports.getMemberStats = asyncHandler(async (req, res) => {
  const gymFilter = req.user.role === "gym-owner" ? { gym: req.user.gym } : {};

  const [total, active, paused, expired, banned] = await Promise.all([
    Member.countDocuments(gymFilter),
    Member.countDocuments({ ...gymFilter, status: "Active" }),
    Member.countDocuments({ ...gymFilter, status: "Paused" }),
    Member.countDocuments({ ...gymFilter, status: "Expired" }),
    Member.countDocuments({ ...gymFilter, status: "Banned" }),
  ]);

  res.json({ success: true, data: { total, active, paused, expired, banned } });
});

// ── Helper ─────────────────────────────────────────────────────────
function getDurationMs(unit) {
  const map = {
    Day: 86400000, Days: 86400000,
    Month: 2592000000, Months: 2592000000,
    Year: 31536000000, Years: 31536000000,
  };
  return map[unit] || 2592000000;
}
