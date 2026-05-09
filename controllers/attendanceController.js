const Attendance = require("../models/Attendance");
const Member     = require("../models/Member");
const Gym        = require("../models/Gym");
const mongoose   = require("mongoose");
const { asyncHandler }                  = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError   = require("../utils/AppError");
const { getIO }  = require("../sockets");

// ─────────────────────────────────────────────────────────────────
// Helper: parse raw QR scan data → extract memberId / qrId
//
// qrService.generateMemberQR encodes:
//   JSON.stringify({ memberId, qrId, type: "member-checkin" })
//
// So the scanned string will be that JSON.
// We also handle edge cases: plain qrId string, plain ObjectId string.
// ─────────────────────────────────────────────────────────────────
const parseQRScan = (raw) => {
  if (!raw || typeof raw !== "string") return {};
  const trimmed = raw.trim();

  // 1. Try JSON  { memberId, qrId, type }
  try {
    const parsed = JSON.parse(trimmed);
    return {
      memberId: parsed.memberId || parsed.id   || parsed._id  || null,
      qrId:     parsed.qrId    || parsed.qrid  || null,
    };
  } catch { /* not JSON */ }

  // 2. Plain 24-char hex → treat as memberId (ObjectId)
  if (/^[a-f\d]{24}$/i.test(trimmed)) {
    return { memberId: trimmed, qrId: null };
  }

  // 3. Anything else → treat as qrId (UUID)
  return { memberId: null, qrId: trimmed };
};

// ─────────────────────────────────────────────────────────────────
// Helper: find member from parsed QR data
// Priority: qrId first (most specific), then memberId
// ─────────────────────────────────────────────────────────────────
const findMemberFromQR = async ({ memberId, qrId }) => {
  let member = null;

  if (qrId) {
    member = await Member.findOne({ qrId: qrId.trim() });
  }

  if (!member && memberId && mongoose.Types.ObjectId.isValid(memberId)) {
    member = await Member.findById(memberId).catch(() => null);
  }

  return member;
};

// ─────────────────────────────────────────────────────────────────
// Helper: mark attendance for a verified member
// ─────────────────────────────────────────────────────────────────
const markAttendance = async ({ member, method = "QR", type = "Gym Access", classId = null }) => {
  const today = new Date().toISOString().split("T")[0];

  // Already checked in today?
  const existing = await Attendance.findOne({
    member: member._id,
    date:   today,
    status: "In",
    type,
  });

  if (existing) {
    return { alreadyIn: true, attendance: existing };
  }

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
    $inc:        { totalCheckins: 1 },
    lastCheckin: new Date(),
  });

  // Real-time event
  const io = getIO();
  if (io) {
    io.to(`gym:${member.gym}`).emit("checkin", {
      memberName: member.name,
      plan:       member.planName,
      time:       new Date().toLocaleTimeString(),
      type,
    });
  }

  return { alreadyIn: false, attendance };
};

// ─────────────────────────────────────────────────────────────────
// @GET /api/attendance
// ─────────────────────────────────────────────────────────────────
exports.getAttendance = asyncHandler(async (req, res) => {
  const { date, memberId, type, gymId } = req.query;
  const filter = {};

  if (req.user.role === "gym-owner") filter.gym = req.user.gym;
  else if (gymId) filter.gym = gymId;

  if (date)     filter.date   = date;
  if (memberId) filter.member = memberId;
  if (type)     filter.type   = type;

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
  if (qrId)          member = await Member.findOne({ qrId });
  else if (memberId) member = await Member.findById(memberId);

  if (!member)                     return next(new AppError("Member not found.", 404));
  if (member.status === "Banned")  return next(new AppError("Member is banned.", 403));
  if (member.status === "Expired") return next(new AppError("Member's plan has expired.", 403));

  const { alreadyIn, attendance } = await markAttendance({ member, method, type, classId });

  if (alreadyIn) return next(new AppError("Member already checked in today.", 400));

  res.status(201).json({
    success: true,
    data:    attendance,
    member:  { name: member.name, plan: member.planName },
  });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/attendance/qr-checkin  (PUBLIC — no auth required)
//
// ── WORKFLOW ──────────────────────────────────────────────────────
//
//  Member's personal QR (generated by qrService.generateMemberQR):
//    Encodes: JSON { memberId, qrId, type: "member-checkin" }
//
//  Member scans QR with phone camera
//    → /checkin page opens (no phone entry needed)
//    → Page auto-submits: POST /api/attendance/qr-checkin
//       Body: { qrData: "<raw scanned string>" }
//
//  Backend:
//    1. Parse qrData → extract qrId and/or memberId
//    2. Find member by qrId first, then memberId
//    3. Verify member status is Active
//    4. Check not already checked in today
//    5. Create Attendance record (method: "QR")
//    6. Update member stats + emit Socket.io event
//    7. Return success
// ─────────────────────────────────────────────────────────────────
exports.qrCheckin = asyncHandler(async (req, res, next) => {
  const { qrData, qrId: directQrId, memberId: directMemberId } = req.body;

  // ── Step 1: Parse QR data ──────────────────────────────────────
  let parsed = {};

  if (qrData) {
    parsed = parseQRScan(qrData);
  } else if (directQrId || directMemberId) {
    // Direct fields (fallback for older clients)
    parsed = { qrId: directQrId || null, memberId: directMemberId || null };
  } else {
    return next(new AppError("QR code data is required.", 400));
  }

  if (!parsed.qrId && !parsed.memberId) {
    return next(new AppError("Invalid QR code — could not extract member identity.", 400));
  }

  // ── Step 2: Find member ────────────────────────────────────────
  const member = await findMemberFromQR(parsed);

  if (!member) {
    return next(new AppError(
      "Member not found. This QR code is not linked to any registered member.",
      404
    ));
  }

  // ── Step 3: Verify member status ──────────────────────────────
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

  // ── Steps 4-6: Mark attendance ─────────────────────────────────
  const { alreadyIn, attendance } = await markAttendance({ member, method: "QR" });

  if (alreadyIn) {
    return res.json({
      success:   true,
      alreadyIn: true,
      message:   `${member.name}, you are already checked in today! Have a great workout! 💪`,
      member:    { name: member.name, planName: member.planName },
    });
  }

  // ── Step 7: Respond ────────────────────────────────────────────
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

  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const d     = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const count = await Attendance.countDocuments({ ...gymFilter, date: d });
    daily.push({ date: d, count });
  }

  res.json({ success: true, data: { todayCount, weekCount, monthCount, daily } });
});
