const Attendance = require("../models/Attendance");
const Member     = require("../models/Member");
const Gym        = require("../models/Gym");
const mongoose   = require("mongoose");
const { asyncHandler }                  = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError   = require("../utils/AppError");
const { getIO }  = require("../sockets");

// ── Helper: normalize phone → last 10 digits ──────────────────────
const normalizePhone = (raw) => {
  if (!raw) return "";
  return raw.replace(/\D/g, "").slice(-10);
};

// ── Helper: parse raw QR scan string ──────────────────────────────
// qrService encodes: JSON { memberId, gymId, qrId, type }
const parseQRScan = (raw) => {
  if (!raw || typeof raw !== "string") return {};
  const trimmed = raw.trim();
  try {
    const p = JSON.parse(trimmed);
    return {
      memberId: p.memberId || p.id   || p._id  || null,
      gymId:    p.gymId    || null,
      qrId:     p.qrId     || null,
    };
  } catch { /* not JSON */ }
  // Plain 24-char hex → memberId
  if (/^[a-f\d]{24}$/i.test(trimmed)) return { memberId: trimmed, gymId: null, qrId: null };
  // Anything else → qrId (UUID)
  return { memberId: null, gymId: null, qrId: trimmed };
};

// ── Helper: mark attendance ────────────────────────────────────────
const markAttendance = async ({ member, method = "QR", type = "Gym Access", classId = null }) => {
  const today = new Date().toISOString().split("T")[0];

  const existing = await Attendance.findOne({ member: member._id, date: today, status: "In", type });
  if (existing) return { alreadyIn: true, attendance: existing };

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
    Attendance.find(filter).populate("member", "name photo plan").sort({ checkInTime: -1 }),
    req.query
  );

  const records = await query;
  res.json({ success: true, data: records, pagination: buildPaginationMeta(total, pagination.page, pagination.limit) });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/attendance/checkin  (protected — gym-owner / admin)
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

  res.status(201).json({ success: true, data: attendance, member: { name: member.name, plan: member.planName } });
});

// ─────────────────────────────────────────────────────────────────
// @POST /api/attendance/qr-checkin  (PUBLIC — no auth)
//
// TWO flows:
//
// FLOW A — Member personal QR (qrData / qrId / memberId in body):
//   QR encodes: { memberId, gymId, qrId, type: "member-checkin" }
//   → Find member by qrId (most reliable)
//   → Verify member._id === memberId (from QR)
//   → Verify member.gym  === gymId   (from QR)
//   → Mark attendance
//
// FLOW B — Gym QR (gymId + phone in body):
//   → Find member by phone in that gym
//   → Mark attendance
// ─────────────────────────────────────────────────────────────────
exports.qrCheckin = asyncHandler(async (req, res, next) => {
  const { qrData, qrId: directQrId, memberId: directMemberId, gymId: directGymId, phone } = req.body;

  let member = null;

  // ── FLOW A: QR data present ────────────────────────────────────
  if (qrData || directQrId || directMemberId) {

    // Parse QR payload
    let parsed = {};
    if (qrData) {
      parsed = parseQRScan(qrData);
    } else {
      parsed = {
        qrId:     directQrId     || null,
        memberId: directMemberId || null,
        gymId:    directGymId    || null,
      };
    }

    // Step 1: Find member by qrId (most specific)
    if (parsed.qrId) {
      member = await Member.findOne({ qrId: parsed.qrId.trim() });
    }

    // Step 2: Fallback — find by memberId
    if (!member && parsed.memberId && mongoose.Types.ObjectId.isValid(parsed.memberId)) {
      member = await Member.findById(parsed.memberId).catch(() => null);
    }

    if (!member) {
      return next(new AppError(
        "Member not found. Please ask your gym to regenerate your QR code.",
        404
      ));
    }

    // Step 3: Verify gymId matches (if gymId was encoded in QR)
    if (parsed.gymId && mongoose.Types.ObjectId.isValid(parsed.gymId)) {
      if (String(member.gym) !== String(parsed.gymId)) {
        return next(new AppError("QR code does not match this gym. Please contact your gym.", 403));
      }
    }

    // Step 4: Verify member.gym is set (fix null gymId issue)
    if (!member.gym) {
      return next(new AppError(
        "Member's gym is not set. Please contact your gym to fix your membership record.",
        400
      ));
    }
  }

  // ── FLOW B: gymId + phone ──────────────────────────────────────
  else if (directGymId && phone) {
    if (!mongoose.Types.ObjectId.isValid(directGymId.trim())) {
      return next(new AppError("Invalid gym QR code. Please ask your gym to regenerate it.", 400));
    }

    const gym = await Gym.findById(directGymId.trim()).select("name status");
    if (!gym)                    return next(new AppError("Gym not found.", 404));
    if (gym.status !== "active") return next(new AppError("This gym is not active.", 403));

    const last10 = normalizePhone(phone);
    if (last10.length < 10) {
      return next(new AppError("Please enter a valid 10-digit mobile number.", 400));
    }

    const gymMembers = await Member.find({
      gym: new mongoose.Types.ObjectId(directGymId.trim()),
    }).select("_id name phone planName status gym");

    member = gymMembers.find(m => normalizePhone(m.phone) === last10) || null;

    if (!member) {
      return next(new AppError(
        `No member found with this phone number in ${gym.name}. ` +
        "Please use the phone number registered with your gym membership.",
        404
      ));
    }
  }

  else {
    return next(new AppError("QR code data is required.", 400));
  }

  // ── Verify member status ───────────────────────────────────────
  if (member.status === "Banned")  return next(new AppError("Your membership has been suspended. Please contact the gym.", 403));
  if (member.status === "Expired") return next(new AppError("Your membership has expired. Please renew your plan.", 403));
  if (member.status === "Paused")  return next(new AppError("Your membership is currently paused. Please contact the gym.", 403));
  if (member.status !== "Active")  return next(new AppError("Your membership is not active. Please contact the gym.", 403));

  // ── Mark attendance ────────────────────────────────────────────
  const { alreadyIn, attendance } = await markAttendance({ member, method: "QR" });

  if (alreadyIn) {
    return res.json({
      success:   true,
      alreadyIn: true,
      message:   `${member.name}, you are already checked in today! Have a great workout! 💪`,
      member:    { name: member.name, planName: member.planName },
    });
  }

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
  attendance.checkOutTime = checkOut;
  attendance.status       = "Out";
  attendance.duration     = Math.round((checkOut - attendance.checkInTime) / 60000);
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
    Attendance.countDocuments({ ...gymFilter, checkInTime: { $gte: new Date(Date.now() - 7  * 86400000) } }),
    Attendance.countDocuments({ ...gymFilter, checkInTime: { $gte: new Date(Date.now() - 30 * 86400000) } }),
  ]);

  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const d     = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const count = await Attendance.countDocuments({ ...gymFilter, date: d });
    daily.push({ date: d, count });
  }

  res.json({ success: true, data: { todayCount, weekCount, monthCount, daily } });
});
