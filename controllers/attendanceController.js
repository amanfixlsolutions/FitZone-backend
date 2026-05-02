const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const Gym = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { getIO } = require("../sockets");

// ── @GET /api/attendance ───────────────────────────────────────────
exports.getAttendance = asyncHandler(async (req, res) => {
  const { date, memberId, type, gymId } = req.query;
  const filter = {};

  if (req.user.role === "gym-owner") filter.gym = req.user.gym;
  else if (gymId) filter.gym = gymId;

  if (date)     filter.date = date;
  if (memberId) filter.member = memberId;
  if (type)     filter.type = type;

  const total = await Attendance.countDocuments(filter);
  const { query, pagination } = paginate(
    Attendance.find(filter).populate("member", "name photo plan").sort({ checkInTime: -1 }),
    req.query
  );

  const records = await query;
  res.json({
    success: true,
    data: records,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @POST /api/attendance/checkin ──────────────────────────────────
exports.checkIn = asyncHandler(async (req, res, next) => {
  const { memberId, qrId, type = "Gym Access", classId, method = "Manual" } = req.body;

  let member;
  if (qrId) {
    member = await Member.findOne({ qrId });
  } else if (memberId) {
    member = await Member.findById(memberId);
  }

  if (!member) return next(new AppError("Member not found.", 404));
  if (member.status === "Banned") return next(new AppError("Member is banned.", 403));
  if (member.status === "Expired") return next(new AppError("Member's plan has expired.", 403));

  const today = new Date().toISOString().split("T")[0];

  // Check if already checked in today
  const existing = await Attendance.findOne({
    member: member._id,
    date: today,
    status: "In",
    type,
  });
  if (existing) return next(new AppError("Member already checked in.", 400));

  const attendance = await Attendance.create({
    gym: member.gym,
    member: member._id,
    memberName: member.name,
    memberPlan: member.planName,
    type,
    class: classId || null,
    method,
    date: today,
  });

  // Update member stats
  await Member.findByIdAndUpdate(member._id, {
    $inc: { totalCheckins: 1 },
    lastCheckin: new Date(),
  });

  // Emit real-time check-in event
  const io = getIO();
  if (io) {
    io.to(`gym:${member.gym}`).emit("checkin", {
      memberName: member.name,
      plan: member.planName,
      time: new Date().toLocaleTimeString(),
      type,
    });
  }

  res.status(201).json({ success: true, data: attendance, member: { name: member.name, plan: member.planName } });
});

// ── @POST /api/attendance/qr-checkin (PUBLIC — no auth) ───────────
// Called when a member scans the gym QR and submits their phone number.
// Verifies they are a registered Active member of that gym.
exports.qrCheckin = asyncHandler(async (req, res, next) => {
  const { gymId, phone } = req.body;

  if (!gymId || !phone) {
    return next(new AppError("Gym ID and phone number are required.", 400));
  }

  // Verify gym exists
  const gym = await Gym.findById(gymId).select("name status");
  if (!gym)                    return next(new AppError("Gym not found.", 404));
  if (gym.status !== "active") return next(new AppError("This gym is not active.", 403));

  // Find member by phone in this gym
  const member = await Member.findOne({
    gym:   gymId,
    phone: { $regex: phone.replace(/\s+/g, "").replace(/^\+91/, ""), $options: "i" },
  });

  if (!member)                          return next(new AppError("No member found with this phone number in this gym.", 404));
  if (member.status === "Banned")       return next(new AppError("Your membership has been banned.", 403));
  if (member.status === "Expired")      return next(new AppError("Your membership has expired. Please renew.", 403));
  if (member.status === "Paused")       return next(new AppError("Your membership is currently paused.", 403));
  if (member.status !== "Active")       return next(new AppError("Your membership is not active.", 403));

  const today = new Date().toISOString().split("T")[0];

  // Already checked in today?
  const existing = await Attendance.findOne({
    member: member._id,
    date:   today,
    status: "In",
    type:   "Gym Access",
  });
  if (existing) {
    return res.json({
      success:  true,
      alreadyIn: true,
      message:  `${member.name}, you are already checked in today!`,
      member:   { name: member.name, planName: member.planName },
    });
  }

  // Create attendance record
  const attendance = await Attendance.create({
    gym:        member.gym,
    member:     member._id,
    memberName: member.name,
    memberPlan: member.planName,
    type:       "Gym Access",
    method:     "QR",
    date:       today,
  });

  // Update member stats
  await Member.findByIdAndUpdate(member._id, {
    $inc: { totalCheckins: 1 },
    lastCheckin: new Date(),
  });

  // Emit real-time event to gym dashboard
  const io = getIO();
  if (io) {
    io.to(`gym:${member.gym}`).emit("checkin", {
      memberName: member.name,
      plan:       member.planName,
      time:       new Date().toLocaleTimeString(),
      type:       "Gym Access",
    });
  }

  res.status(201).json({
    success:  true,
    alreadyIn: false,
    message:  `Welcome, ${member.name}! Attendance marked successfully.`,
    member:   { name: member.name, planName: member.planName },
    data:     attendance,
  });
});

// ── @POST /api/attendance/checkout ────────────────────────────────
exports.checkOut = asyncHandler(async (req, res, next) => {
  const { attendanceId } = req.body;

  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) return next(new AppError("Attendance record not found.", 404));

  const checkOut = new Date();
  const duration = Math.round((checkOut - attendance.checkInTime) / 60000);

  attendance.checkOutTime = checkOut;
  attendance.status = "Out";
  attendance.duration = duration;
  await attendance.save();

  res.json({ success: true, data: attendance });
});

// ── @GET /api/attendance/stats ─────────────────────────────────────
exports.getAttendanceStats = asyncHandler(async (req, res) => {
  const gymFilter = req.user.role === "gym-owner" ? { gym: req.user.gym } : {};
  const today = new Date().toISOString().split("T")[0];

  const [todayCount, weekCount, monthCount] = await Promise.all([
    Attendance.countDocuments({ ...gymFilter, date: today }),
    Attendance.countDocuments({
      ...gymFilter,
      checkInTime: { $gte: new Date(Date.now() - 7 * 86400000) },
    }),
    Attendance.countDocuments({
      ...gymFilter,
      checkInTime: { $gte: new Date(Date.now() - 30 * 86400000) },
    }),
  ]);

  // Daily breakdown for last 7 days
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const count = await Attendance.countDocuments({ ...gymFilter, date: d });
    daily.push({ date: d, count });
  }

  res.json({ success: true, data: { todayCount, weekCount, monthCount, daily } });
});
