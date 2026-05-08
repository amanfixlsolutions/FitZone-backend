const Gym    = require("../models/Gym");
const User   = require("../models/User");
const Member = require("../models/Member");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { sendGymApprovalEmail } = require("../services/emailService");
const { notifyGym } = require("../services/notificationService");

// ── @GET /api/gyms/public ──────────────────────────────────────────
// Public endpoint — returns active gyms for signup gym selection
exports.getPublicGyms = asyncHandler(async (req, res) => {
  const gyms = await Gym.find({ status: "active" })
    .select("name city logo address")
    .sort({ name: 1 });

  res.json({ success: true, data: gyms });
});

// ── @GET /api/gyms ─────────────────────────────────────────────────
exports.getGyms = asyncHandler(async (req, res) => {
  const { status, city, search, page, limit } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (city)   filter.city = new RegExp(city, "i");
  if (search) filter.$or = [
    { name: new RegExp(search, "i") },
    { ownerName: new RegExp(search, "i") },
    { city: new RegExp(search, "i") },
  ];

  const total = await Gym.countDocuments(filter);
  const { query, pagination } = paginate(
    Gym.find(filter).populate("owner", "name email").sort({ createdAt: -1 }),
    { page, limit }
  );

  const gyms = await query;

  // ── Enrich with real-time member counts from Member collection ─
  const gymIds = gyms.map(g => g._id);
  const memberCounts = await Member.aggregate([
    { $match: { gym: { $in: gymIds } } },
    { $group: {
      _id:           "$gym",
      totalMembers:  { $sum: 1 },
      activeMembers: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] } },
    }},
  ]);

  // Build lookup map
  const countMap = {};
  memberCounts.forEach(c => { countMap[c._id.toString()] = c; });

  // Merge real counts into gym objects
  const enriched = gyms.map(g => {
    const plain = g.toObject();
    const counts = countMap[g._id.toString()];
    if (counts) {
      plain.totalMembers  = counts.totalMembers;
      plain.activeMembers = counts.activeMembers;
    }
    return plain;
  });

  res.json({
    success: true,
    data: enriched,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/gyms/:id ─────────────────────────────────────────────
exports.getGym = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id).populate("owner", "name email phone");
  if (!gym) return next(new AppError("Gym not found.", 404));

  // Real-time member counts
  const [totalMembers, activeMembers] = await Promise.all([
    Member.countDocuments({ gym: gym._id }),
    Member.countDocuments({ gym: gym._id, status: "Active" }),
  ]);

  const plain = gym.toObject();
  plain.totalMembers  = totalMembers;
  plain.activeMembers = activeMembers;

  res.json({ success: true, data: plain });
});

// ── @POST /api/gyms ────────────────────────────────────────────────
exports.createGym = asyncHandler(async (req, res) => {
  const gym = await Gym.create({ ...req.body, owner: req.user._id, ownerName: req.user.name });

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "CREATE_GYM", module: "Gyms",
    details: `New gym registered: ${gym.name}`,
  });

  // ── Notify super-admin of new gym registration ─────────────────
  const { createNotification } = require("../services/notificationService");
  await createNotification({
    sender:   req.user._id,
    title:    "New Gym Registration",
    message:  `${gym.name} (${gym.city}) has submitted for approval.`,
    type:     "gym",
    audience: "super-admin",
  }).catch(() => {});

  res.status(201).json({ success: true, data: gym });
});

// ── @PUT /api/gyms/:id ─────────────────────────────────────────────
exports.updateGym = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!gym) return next(new AppError("Gym not found.", 404));
  res.json({ success: true, data: gym });
});

// ── @POST /api/gyms/:id/approve ────────────────────────────────────
exports.approveGym = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id).populate("owner");
  if (!gym) return next(new AppError("Gym not found.", 404));

  gym.status = "active";
  gym.approvedAt = new Date();
  gym.approvedBy = req.user._id;
  await gym.save();

  // Update owner's gym reference
  await User.findByIdAndUpdate(gym.owner._id, { gym: gym._id });

  // Send email
  try { await sendGymApprovalEmail(gym.owner, gym.name, true); } catch (_) {}

  await notifyGym(gym._id, "Gym Approved! 🎉", `${gym.name} has been approved on FitZone.`, "gym");

  // ── Also notify super-admin feed ───────────────────────────────
  const { createNotification } = require("../services/notificationService");
  await createNotification({
    sender:   req.user._id,
    title:    "Gym Approved",
    message:  `${gym.name} (${gym.city}) has been approved and is now live.`,
    type:     "gym",
    audience: "super-admin",
  }).catch(() => {});

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "APPROVE_GYM", module: "Gyms",
    details: `Approved gym: ${gym.name}`,
  });

  res.json({ success: true, message: "Gym approved successfully.", data: gym });
});

// ── @POST /api/gyms/:id/reject ─────────────────────────────────────
exports.rejectGym = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id).populate("owner");
  if (!gym) return next(new AppError("Gym not found.", 404));

  gym.status = "rejected";
  gym.rejectedAt = new Date();
  gym.rejectedBy = req.user._id;
  gym.rejectReason = req.body.reason || "";
  await gym.save();

  try { await sendGymApprovalEmail(gym.owner, gym.name, false); } catch (_) {}

  // ── Notify super-admin feed ────────────────────────────────────
  const { createNotification: cn } = require("../services/notificationService");
  await cn({
    sender:   req.user._id,
    title:    "Gym Rejected",
    message:  `${gym.name} was rejected. Reason: ${gym.rejectReason || "—"}`,
    type:     "alert",
    audience: "super-admin",
  }).catch(() => {});

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "REJECT_GYM", module: "Gyms",
    details: `Rejected gym: ${gym.name}. Reason: ${gym.rejectReason}`,
  });

  res.json({ success: true, message: "Gym rejected.", data: gym });
});

// ── @POST /api/gyms/:id/suspend ────────────────────────────────────
exports.suspendGym = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findByIdAndUpdate(
    req.params.id,
    { status: "suspended" },
    { new: true }
  );
  if (!gym) return next(new AppError("Gym not found.", 404));

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "SUSPEND_GYM", module: "Gyms",
    details: `Suspended gym: ${gym.name}`,
  });

  // ── Notify super-admin feed ────────────────────────────────────
  const { createNotification: cnSuspend } = require("../services/notificationService");
  await cnSuspend({
    sender:   req.user._id,
    title:    "Gym Suspended",
    message:  `${gym.name} has been suspended from the platform.`,
    type:     "alert",
    audience: "super-admin",
  }).catch(() => {});

  res.json({ success: true, message: "Gym suspended.", data: gym });
});

// ── @DELETE /api/gyms/:id ──────────────────────────────────────────
exports.deleteGym = asyncHandler(async (req, res, next) => {
  const gym = await Gym.findByIdAndDelete(req.params.id);
  if (!gym) return next(new AppError("Gym not found.", 404));
  res.json({ success: true, message: "Gym deleted." });
});

// ── @POST /api/gyms/create-with-owner ─────────────────────────────
// Super-admin creates a gym + gym-owner account in one shot
exports.createGymWithOwner = asyncHandler(async (req, res, next) => {
  const {
    // Owner fields
    ownerName, ownerEmail, ownerPassword, ownerPhone,
    // Gym fields
    gymName, city, address, phone, description,
  } = req.body;

  // ── Validate required fields ───────────────────────────────────
  if (!ownerName || !ownerEmail || !ownerPassword || !gymName || !city) {
    return next(new AppError("ownerName, ownerEmail, ownerPassword, gymName and city are required.", 400));
  }

  // ── Check email uniqueness ─────────────────────────────────────
  const existing = await User.findOne({ email: ownerEmail.toLowerCase().trim() });
  if (existing) return next(new AppError("A user with this email already exists.", 409));

  // ── Create User (gym-owner) ────────────────────────────────────
  const owner = await User.create({
    name:            ownerName.trim(),
    email:           ownerEmail.toLowerCase().trim(),
    password:        ownerPassword,          // pre-save hook hashes it
    role:            "gym-owner",
    phone:           ownerPhone || "",
    isEmailVerified: true,                   // super-admin created = verified
    status:          "active",
  });

  // ── Create Gym (auto-approved) ─────────────────────────────────
  const gym = await Gym.create({
    name:        gymName.trim(),
    owner:       owner._id,
    ownerName:   owner.name,
    email:       owner.email,
    phone:       phone || ownerPhone || "",
    city:        city.trim(),
    address:     address || "",
    description: description || "",
    status:      "active",                   // super-admin created = immediately active
    approvedAt:  new Date(),
    approvedBy:  req.user._id,
    docs:        { submitted: true, verified: true },
  });

  // ── Link gym back to owner ─────────────────────────────────────
  owner.gym = gym._id;
  await owner.save({ validateBeforeSave: false });

  // ── Activity log ───────────────────────────────────────────────
  await ActivityLog.create({
    user:     req.user._id,
    userName: req.user.name,
    role:     req.user.role,
    action:   "CREATE_GYM_WITH_OWNER",
    module:   "Gyms",
    details:  `Super-admin created gym "${gym.name}" with owner "${owner.name}" (${owner.email})`,
  });

  // ── Send welcome email (non-blocking) ─────────────────────────
  try {
    const { sendGymApprovalEmail } = require("../services/emailService");
    await sendGymApprovalEmail(owner, gym.name, true);
  } catch (_) {}

  res.status(201).json({
    success: true,
    message: `Gym "${gym.name}" and owner account created successfully.`,
    data: {
      gym,
      owner: {
        _id:   owner._id,
        name:  owner.name,
        email: owner.email,
        role:  owner.role,
      },
    },
  });
});

// ── @GET /api/gyms/stats ───────────────────────────────────────────
exports.getGymStats = asyncHandler(async (req, res) => {
  const [total, active, pending, suspended] = await Promise.all([
    Gym.countDocuments(),
    Gym.countDocuments({ status: "active" }),
    Gym.countDocuments({ status: "pending" }),
    Gym.countDocuments({ status: "suspended" }),
  ]);
  res.json({ success: true, data: { total, active, pending, suspended } });
});
