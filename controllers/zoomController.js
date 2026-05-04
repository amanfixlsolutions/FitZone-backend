const ZoomMeeting = require("../models/ZoomMeeting");
const Class = require("../models/Class");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const zoomService = require("../services/zoomService");
const { createNotification } = require("../services/notificationService");

// ── @POST /api/zoom/meetings ───────────────────────────────────────
exports.createMeeting = asyncHandler(async (req, res, next) => {
  const { topic, agenda, startTime, duration, classId, trainerId, hostEmail } = req.body;

  if (!hostEmail) return next(new AppError("Host email is required.", 400));

  // Create Zoom meeting
  const zoomData = await zoomService.createMeeting({ topic, agenda, startTime, duration, hostEmail });

  const meeting = await ZoomMeeting.create({
    gym: req.user.gym || req.body.gymId,
    class: classId || null,
    trainer: trainerId || null,
    createdBy: req.user._id,
    topic,
    agenda,
    hostEmail,
    zoomMeetingId: zoomData.meetingId,
    startTime: new Date(startTime),
    duration,
    joinUrl: zoomData.joinUrl,
    startUrl: zoomData.startUrl,
    password: zoomData.password,
  });

  // Update class with Zoom info if linked
  if (classId) {
    await Class.findByIdAndUpdate(classId, {
      zoomMeetingId: zoomData.meetingId,
      zoomJoinUrl: zoomData.joinUrl,
      zoomStartUrl: zoomData.startUrl,
      isOnline: true,
    });
  }

  // Notify gym members
  await createNotification({
    gym: req.user.gym,
    title: "New Live Class Scheduled",
    message: `${topic} starts at ${new Date(startTime).toLocaleString()}`,
    type: "class",
    audience: "specific-gym",
    link: zoomData.joinUrl,
  });

  res.status(201).json({ success: true, data: meeting });
});

// ── @GET /api/zoom/meetings ────────────────────────────────────────
exports.getMeetings = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === "gym-owner") filter.gym = req.user.gym;

  const total = await ZoomMeeting.countDocuments(filter);
  const { query, pagination } = paginate(
    ZoomMeeting.find(filter)
      .populate("class", "name")
      .populate("trainer", "name")
      .sort({ startTime: -1 }),
    req.query
  );

  const meetings = await query;
  res.json({
    success: true,
    data: meetings,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/zoom/meetings/:id ────────────────────────────────────
exports.getMeeting = asyncHandler(async (req, res, next) => {
  const meeting = await ZoomMeeting.findById(req.params.id)
    .populate("class trainer createdBy", "name email");
  if (!meeting) return next(new AppError("Meeting not found.", 404));
  res.json({ success: true, data: meeting });
});

// ── @DELETE /api/zoom/meetings/:id ────────────────────────────────
exports.deleteMeeting = asyncHandler(async (req, res, next) => {
  const meeting = await ZoomMeeting.findById(req.params.id);
  if (!meeting) return next(new AppError("Meeting not found.", 404));

  try {
    await zoomService.deleteMeeting(meeting.zoomMeetingId);
  } catch (_) { }

  meeting.status = "cancelled";
  await meeting.save();

  res.json({ success: true, message: "Meeting cancelled." });
});

// ── @POST /api/zoom/meetings/:id/register ─────────────────────────
exports.registerForMeeting = asyncHandler(async (req, res, next) => {
  const { memberId } = req.body;
  const meeting = await ZoomMeeting.findById(req.params.id);
  if (!meeting) return next(new AppError("Meeting not found.", 404));

  if (!meeting.registeredMembers.includes(memberId)) {
    meeting.registeredMembers.push(memberId);
    await meeting.save();
  }

  res.json({
    success: true,
    message: "Registered for meeting.",
    joinUrl: meeting.joinUrl,
    password: meeting.password,
  });
});
