const Class = require("../models/Class");
const Member = require("../models/Member");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");

// ── @GET /api/classes ──────────────────────────────────────────────
exports.getClasses = asyncHandler(async (req, res) => {
  const { status, level, search, gymId, day } = req.query;
  const filter = {};

  // Public access (no auth) — show only Active classes
  if (!req.user) {
    filter.status = "Active";
  } else if (req.user.role === "gym-owner") {
    filter.gym = req.user.gym;
  } else if (gymId) {
    filter.gym = gymId;
  }

  if (status && req.user) filter.status = status; // only override if authenticated
  if (level)  filter.level = level;
  if (day)    filter.days = day;
  if (search) filter.$or = [
    { name: new RegExp(search, "i") },
    { trainerName: new RegExp(search, "i") },
  ];

  const total = await Class.countDocuments(filter);
  const { query, pagination } = paginate(
    Class.find(filter).populate("trainer", "name specialty photo").sort({ createdAt: -1 }),
    req.query
  );

  const classes = await query;
  res.json({
    success: true,
    data: classes,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/classes/:id ──────────────────────────────────────────
exports.getClass = asyncHandler(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
    .populate("trainer", "name specialty photo rating")
    .populate("enrolledMembers", "name email");
  if (!cls) return next(new AppError("Class not found.", 404));
  res.json({ success: true, data: cls });
});

// ── @POST /api/classes ─────────────────────────────────────────────
exports.createClass = asyncHandler(async (req, res) => {
  let gymId = req.user.role === "gym-owner" ? req.user.gym : req.body.gym;
  if (!gymId && req.user.role === "gym-owner") {
    const Gym = require("../models/Gym");
    const gym = await Gym.findOne({ owner: req.user._id });
    if (gym) gymId = gym._id;
  }

  const cls = await Class.create({
    ...req.body,
    gym: gymId,
    addedBy: req.user._id,
  });

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "ADD_CLASS", module: "Classes",
    details: `Added class: ${cls.name}`,
  });

  // ── Notification ──────────────────────────────────────────────
  const days = Array.isArray(cls.days) ? cls.days.join(", ") : cls.days;
  await createNotification({
    gym:      gymId,
    sender:   req.user._id,
    title:    "New Class Scheduled",
    message:  `${cls.name} by ${cls.trainerName} — ${days} at ${cls.startTime}.`,
    type:     "class",
    audience: "specific-gym",
  }).catch(() => {});

  res.status(201).json({ success: true, data: cls });
});

// ── @PUT /api/classes/:id ──────────────────────────────────────────
exports.updateClass = asyncHandler(async (req, res, next) => {
  const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cls) return next(new AppError("Class not found.", 404));

  // ── Notification ──────────────────────────────────────────────
  await createNotification({
    gym:      cls.gym,
    sender:   req.user._id,
    title:    "Class Updated",
    message:  `${cls.name} schedule has been updated.`,
    type:     "class",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, data: cls });
});

// ── @DELETE /api/classes/:id ───────────────────────────────────────
exports.deleteClass = asyncHandler(async (req, res, next) => {
  const cls = await Class.findByIdAndDelete(req.params.id);
  if (!cls) return next(new AppError("Class not found.", 404));

  // ── Notification ──────────────────────────────────────────────
  await createNotification({
    gym:      cls.gym,
    sender:   req.user._id,
    title:    "Class Removed",
    message:  `${cls.name} has been removed from the schedule.`,
    type:     "class",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Class deleted." });
});

// ── @POST /api/classes/:id/enroll ─────────────────────────────────
exports.enrollMember = asyncHandler(async (req, res, next) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return next(new AppError("Class not found.", 404));
  if (cls.enrolled >= cls.capacity) return next(new AppError("Class is full.", 400));

  const { memberId } = req.body;
  if (cls.enrolledMembers.includes(memberId)) {
    return next(new AppError("Member already enrolled.", 400));
  }

  cls.enrolledMembers.push(memberId);
  cls.enrolled += 1;
  await cls.save();

  // Notify if class is now full
  if (cls.enrolled >= cls.capacity) {
    await createNotification({
      gym:      cls.gym,
      title:    "Class Fully Booked",
      message:  `${cls.name} is now fully booked (${cls.capacity}/${cls.capacity}).`,
      type:     "class",
      audience: "specific-gym",
    }).catch(() => {});
  }

  res.json({ success: true, message: "Member enrolled.", data: cls });
});

// ── @POST /api/classes/:id/unenroll ───────────────────────────────
exports.unenrollMember = asyncHandler(async (req, res, next) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return next(new AppError("Class not found.", 404));

  const { memberId } = req.body;
  cls.enrolledMembers = cls.enrolledMembers.filter(m => m.toString() !== memberId);
  cls.enrolled = Math.max(0, cls.enrolled - 1);
  await cls.save();

  res.json({ success: true, message: "Member unenrolled.", data: cls });
});

// ── @GET /api/classes/today ────────────────────────────────────────
exports.getTodayClasses = asyncHandler(async (req, res) => {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const today = days[new Date().getDay()];

  const filter = { days: today, status: "Active" };
  if (req.user.role === "gym-owner") filter.gym = req.user.gym;

  const classes = await Class.find(filter)
    .populate("trainer", "name photo")
    .sort({ startTime: 1 });

  res.json({ success: true, data: classes });
});
