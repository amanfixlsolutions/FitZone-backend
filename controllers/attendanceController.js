const Attendance = require("../models/Attendance");
const Member     = require("../models/Member");
const Gym        = require("../models/Gym");
const mongoose   = require("mongoose");
const { asyncHandler }                  = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError   = require("../utils/AppError");
const { getIO }  = require("../sockets");

// ── Helper: extract last 10 digits from any phone format ──────────
// Handles: +919876543210 / 09876543210 / 9876543210 / +91 98765 43210
const normalizePhone = (raw) => {
  if (!raw) return "";
  return raw.replace(/\D/g, "").slice(-10); // digits only → last 10
};

// ─────────────────────────────────────────────────────────────────
// @GET /api/attendance
// ─────────────────────────────────────────────────────────────────
exports.getAttendance = asyncHandler(async (req, res) => {
  const { date, memberId, type, gymId } = req.query;
  const filter = {};

  if (req.user.role === "gym-owner") filter.gym = req.user.gym;
  else if (gymId) filter.gym = gymId;

  if (date)     filter.date     = date;
  if (memberId) filter.member   = memberId;
  if (type)     filter.type     = type;

  const total = await Attendance.countDocuments(filter);
  const { query, pagination } = paginate(
    Attendance.find(filter)
      .populate("member", "name photo plan")
      .sort({ checkInTime: -1 }),
    req.query
  );

  const records = await query;
  res.json({
    success: true,
    data: records,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/attendance/checkin  (protected — gym-owner / admin)
// Manual check-in by memberId or qrId
// ─────────────────────────────────────────────────────────────────
exports.checkIn = asyncHandler(async (req, res, next) => {
  const { memberId, qrId, type = "Gym Access", classId, method = "Manual" } = req.body;

  let member;
  if (qrId)      member = await Member.findOne({ qrId });
  else if (memberId) member = await Member.findById(memberId);

  if (!member)                    return next(new AppError("Member not found.", 404));
  if (member.status === "Banned") return next(new AppError("Member is banned.", 403));
  if (member.status === "Expired") return next(new AppError("Member's plan has expired.", 403));

  const today = new Date().toISOString().split("T")[0];

  const existing = await Attendance.findOne({ member: member._id, date: today, status: "In", type });
  if (existing) return next(new AppError("Member already checked in.", 400));

  const attendance = await Attendance.create({
    gym:        member.gym,
    member:     member._id,
    memberName: member.name,
    memberPlan: member.planName,
    type,
    class:      classId || null,
    method,
    date:       today,
  });

  await Member.findByIdAndUpdate(member._id, {
    $inc: { totalCheckins: 1 },
    lastCheckin: new Date(),
  });

  const io = getIO();
  if (io) {
    io.to(`gym:${member.gym}`).emit("checkin", {
      memberName: member.name,
      plan:       member.planName,
      time:       new Date().toLocaleTimeString(),
      type,
    });
  }

  res.status(201).json({
    success: true,
    data:    attendance,
    member:  { name: member.name, plan: member.planName },
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/attendance/qr-checkin  (PUBLIC — no auth required)
//
// WORKFLOW:
//   1. Gym Owner generates a QR on the Attendance page.
//      QR encodes the URL:  /checkin?gym=<gymId>&name=<gymName>
//
//   2. Member scans QR with phone camera → browser opens /checkin page.
//
//   3. Member enters their registered phone number and submits.
//      Frontend sends:  POST /api/attendance/qr-checkin
//                       Body: { gymId, phone }
//
//   4. Backend:
//      a. Validate gymId is a valid ObjectId
//      b. Find the gym — must be active
//      c. Normalize phone → last 10 digits
//      d. Find member in that gym whose phone (normalized) matches
//      e. Verify member status is Active
//      f. Check not already checked in today
//      g. Create Attendance record  (method: "QR")
//      h. Update member stats
//      i. Emit Socket.io event to gym room
//      j. Return success response
// ─────────────────────────────────────────────────────────────────
exports.qrCheckin = asyncHandler(async (req, res, next) => {
  const { gymId, phone } = req.body;

  // ── Validate inputs ────────────────────────────────────────────
  if (!gymId || !phone) {
    return next(new AppError("gymId and phone are required.", 400));
  }

  if (!mongoose.Types.ObjectId.isValid(gymId.trim())) {
    return next(new AppError(
      "Invalid QR code — gym ID is malformed. Please ask your gym to regenerate the attendance QR.",
      400
    ));
  }

  // ── Step b: Find & verify gym ──────────────────────────────────
  const gym = await Gym.findById(gymId.trim()).select("name status");
  if (!gym) {
    return next(new AppError("Gym not found. The QR code may be outdated.", 404));
  }
  if (gym.status !== "active") {
    return next(new AppError("This gym is currently not active.", 403));
  }

  // ── Step c: Normalize phone ────────────────────────────────────
  const inputLast10 = normalizePhone(phone);
  if (inputLast10.length < 10) {
    return next(new AppError("Please enter a valid 10-digit mobile number.", 400));
  }

  // ── Step d: Find member by phone in this gym ───────────────────
  // Fetch all members of this gym and compare normalized phone.
  // This is safe because a gym typically has < 1000 members,
  // and avoids regex index issues with different phone formats.
  const gymMembers = await Member.find({
    gym: new mongoose.Types.ObjectId(gymId.trim()),
  }).select("_id name phone planName status gym");

  const member = gymMembers.find(
    (m) => normalizePhone(m.phone) === inputLast10
  ) || null;

  if (!member) {
    return next(new AppError(
      `No member found with this phone number in ${gym.name}. ` +
      "Please make sure you are using the phone number registered with your gym.",
      404
    ));
  }

  // ── Step e: Verify member status ──────────────────────────────
  if (member.status === "Banned") {
    return next(new AppError("Your membership has been suspended. Please contact the gym.", 403));
  }
  if (member.status === "Expired") {
    return next(new AppError("Your membership has expired. Please renew your plan.", 403));
  }
  if (member.status === "Paused") {
    return next(new AppError("Your membership is currently paused. Please contact the gym.", 403));
  }
  if (member.status !== "Active") {
    return next(new AppError("Your membership is not active. Please contact the gym.", 403));
  }

  // ── Step f: Check already checked in today ─────────────────────
  const today = new Date().toISOString().split("T")[0];

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
      message:   `${member.name}, you are already checked in today! Have a great workout! 💪`,
      member:    { name: member.name, planName: member.planName },
    });
  }

  // ── Step g: Create attendance record ──────────────────────────
  const attendance = await Attendance.create({
    gym:        member.gym,
    member:     member._id,
    memberName: member.name,
    memberPlan: member.planName,
    type:       "Gym Access",
    method:     "QR",
    date:       today,
  });

  // ── Step h: Update member stats ────────────────────────────────
  await Member.findByIdAndUpdate(member._id, {
    $inc:        { totalCheckins: 1 },
    lastCheckin: new Date(),
  });

  // ── Step i: Emit real-time event ───────────────────────────────
  const io = getIO();
  if (io) {
    io.to(`gym:${member.gym}`).emit("checkin", {
      memberName: member.name,
      plan:       member.planName,
      time:       new Date().toLocaleTimeString(),
      type:       "Gym Access",
    });
  }

  // ── Step j: Respond ────────────────────────────────────────────
  res.status(201).json({
    success:   true,
    alreadyIn: false,
    message:   `Welcome, ${member.name}! Attendance marked. Have a great workout! 💪`,
    member:    { name: member.name, planName: member.planName },
    data:      attendance,
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/attendance/checkout
// ─────────────────────────────────────────────────────────────────
exports.checkOut = asyncHandler(async (req, res, next) => {
  const { attendanceId } = req.body;

  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) return next(new AppError("Attendance record not found.", 404));

  const checkOut = new Date();
  const duration = Math.round((checkOut - attendance.checkInTime) / 60000);

  attendance.checkOutTime = checkOut;
  attendance.status       = "Out";
  attendance.duration     = duration;
  await attendance.save();

  res.json({ success: true, data: attendance });
});

// ─────────────────────────────────────────────────────────────────
// @GET /api/attendance/stats
// ─────────────────────────────────────────────────────────────────
exports.getAttendanceStats = asyncHandler(async (req, res) => {
  const gymFilter = req.user.role === "gym-owner" ? { gym: req.user.gym } : {};
  const today     = new Date().toISOString().split("T")[0];

  const [todayCount, weekCount, monthCount] = await Promise.all([
    Attendance.countDocuments({ ...gymFilter, date: today }),
    Attendance.countDocuments({
      ...gymFilter,
      checkInTime: { $gte: new Date(Date.now() - 7  * 86400000) },
    }),
    Attendance.countDocuments({
      ...gymFilter,
      checkInTime: { $gte: new Date(Date.now() - 30 * 86400000) },
    }),
  ]);

  // Daily breakdown for last 7 days
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const d     = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const count = await Attendance.countDocuments({ ...gymFilter, date: d });
    daily.push({ date: d, count });
  }

  res.json({ success: true, data: { todayCount, weekCount, monthCount, daily } });
});
