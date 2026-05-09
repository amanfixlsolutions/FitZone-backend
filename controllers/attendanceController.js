const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const Gym = require("../models/Gym");
const mongoose = require("mongoose");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { getIO } = require("../sockets");

// ── Helper: extract last 10 digits from any phone format ──────────
// Handles: +919876543210, 09876543210, 9876543210, +91 98765 43210
const normalizePhone = (phone) => {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, ""); // keep only digits
  return digits.slice(-10); // always last 10 digits
};

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
// Accepts either:
//   { qrData }         — raw QR code data (from navbar scanner)
//   { gymId, phone }   — from /checkin page (member enters phone after scanning gym QR)
exports.qrCheckin = asyncHandler(async (req, res, next) => {
  const { qrData, memberId, gymId, phone } = req.body;

  let member = null;

  // ── Path A: gymId + phone (from /checkin page) ─────────────────
  if (gymId && phone) {
    // Validate gymId is a valid ObjectId before querying
    if (!mongoose.Types.ObjectId.isValid(gymId)) {
      return next(new AppError("Invalid gym ID in QR code. Please ask your gym to regenerate the QR.", 400));
    }

    const gymObjId = new mongoose.Types.ObjectId(gymId);

    const gym = await Gym.findById(gymObjId).select("name status");
    if (!gym)                    return next(new AppError("Gym not found.", 404));
    if (gym.status !== "active") return next(new AppError("This gym is not active.", 403));

    // Normalize: extract last 10 digits from whatever user typed
    const last10 = normalizePhone(phone);
    if (last10.length < 10) {
      return next(new AppError("Please enter a valid 10-digit phone number.", 400));
    }

    // Search all members of this gym, then match phone by last 10 digits
    // This handles any storage format: 9876543210, +919876543210, 09876543210
    const gymMembers = await Member.find({ gym: gymObjId }).select("phone name planName status _id gym");
    member = gymMembers.find(m => normalizePhone(m.phone) === last10) || null;

    if (!member) {
      return next(new AppError(
        `No member found with phone number ending in ${last10}. Please check your registered phone number.`,
        404
      ));
    }
  }

  // ── Path B: raw QR data (from navbar scanner) ──────────────────
  else if (qrData || memberId) {
    const data = (qrData || memberId || "").trim();

    // 1. Try as qrId
    member = await Member.findOne({ qrId: data });

    // 2. Try as MongoDB ObjectId
    if (!member && data.match(/^[a-f\d]{24}$/i)) {
      member = await Member.findById(data).catch(() => null);
    }

    // 3. Try parsing JSON
    if (!member) {
      try {
        const parsed = JSON.parse(data);
        const id = parsed.memberId || parsed.id || parsed._id;
        if (id) member = await Member.findById(id).catch(() => null);
        if (!member && parsed.qrId) member = await Member.findOne({ qrId: parsed.qrId });
      } catch { /* not JSON */ }
    }

    // 4. Try as phone number
    if (!member) {
      const cleanPhone = data.replace(/\s+/g, "").replace(/^\+91/, "");
      if (cleanPhone.length >= 10) {
        member = await Member.findOne({ phone: { $regex: cleanPhone, $options: "i" } });
      }
    }

    if (!member) return next(new AppError("Member not found. Invalid QR code.", 404));
  }

  else {
    return next(new AppError("QR code data or phone number is required.", 400));
  }

  // ── Verify membership ──────────────────────────────────────────
  const gym = await Gym.findById(member.gym).select("name status");
  if (!gym || gym.status !== "active") {
    return next(new AppError("This gym is not active.", 403));
  }

  if (member.status === "Banned")  return next(new AppError("Your membership has been banned.", 403));
  if (member.status === "Expired") return next(new AppError("Your membership has expired. Please renew.", 403));
  if (member.status === "Paused")  return next(new AppError("Your membership is currently paused.", 403));
  if (member.status !== "Active")  return next(new AppError("Your membership is not active.", 403));

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
      success:   true,
      alreadyIn: true,
      message:   `${member.name}, you are already checked in today!`,
      member:    { name: member.name, planName: member.planName },
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

  // Emit real-time event
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
    success:   true,
    alreadyIn: false,
    message:   `Welcome, ${member.name}! Attendance marked successfully.`,
    member:    { name: member.name, planName: member.planName },
    data:      attendance,
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
