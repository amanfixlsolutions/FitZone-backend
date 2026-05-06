const LiveClass        = require("../models/LiveClass");
const LiveClassBooking = require("../models/LiveClassBooking");
const Member           = require("../models/Member");
const Gym              = require("../models/Gym");
const Payment          = require("../models/Payment");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError         = require("../utils/AppError");
const zoomService      = require("../services/zoomService");
const { createNotification } = require("../services/notificationService");
const logger           = require("../utils/logger");

// ── Helper: check if user can manage live classes ─────────────────
// Accepts gym-owner, super-admin, OR any user who owns a gym
const canManage = async (user) => {
  if (user.role === "super-admin") return true;
  if (user.role === "gym-owner")   return true;
  // Check if this user owns a gym (even if role is wrong in DB)
  const gym = await Gym.findOne({ owner: user._id });
  return !!gym;
};

// ── Helper: resolve gym ID for gym-owner ──────────────────────────
const resolveGymId = async (user) => {
  if (user.gym) return user.gym;
  const gym = await Gym.findOne({ owner: user._id });
  return gym?._id || null;
};

// ─────────────────────────────────────────────────────────────────
// GYM OWNER — CRUD
// ─────────────────────────────────────────────────────────────────

// @GET /api/live-classes  (gym-owner sees own gym; super-admin sees all)
exports.getLiveClasses = asyncHandler(async (req, res) => {
  if (!await canManage(req.user)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }
  const { status, category, page, limit } = req.query;
  const filter = {};

  if (req.user.role === "gym-owner") {
    const gymId = await resolveGymId(req.user);
    if (gymId) filter.gym = gymId;
  }

  if (status)   filter.status   = status;
  if (category) filter.category = category;

  const total = await LiveClass.countDocuments(filter);
  const { query, pagination } = paginate(
    LiveClass.find(filter)
      .populate("trainer", "name photo specialty")
      .sort({ scheduledAt: -1 }),
    { page, limit }
  );

  const classes = await query;

  // Attach booking count to each class
  const classIds = classes.map(c => c._id);
  const bookingCounts = await LiveClassBooking.aggregate([
    { $match: { liveClass: { $in: classIds }, bookingStatus: "confirmed" } },
    { $group: { _id: "$liveClass", count: { $sum: 1 } } },
  ]);
  const countMap = {};
  bookingCounts.forEach(b => { countMap[b._id.toString()] = b.count; });

  const enriched = classes.map(c => ({
    ...c.toObject(),
    confirmedBookings: countMap[c._id.toString()] || 0,
  }));

  res.json({
    success: true,
    data: enriched,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// @GET /api/live-classes/:id
exports.getLiveClass = asyncHandler(async (req, res, next) => {
  const lc = await LiveClass.findById(req.params.id)
    .populate("trainer", "name photo specialty certification");
  if (!lc) return next(new AppError("Live class not found.", 404));
  res.json({ success: true, data: lc });
});

// @POST /api/live-classes  (gym-owner OR super-admin creates)
exports.createLiveClass = asyncHandler(async (req, res, next) => {
  if (!await canManage(req.user)) {
    return next(new AppError("Access denied. Only gym owners can create live classes.", 403));
  }
  let gymId = await resolveGymId(req.user);

  // Super-admin fallback — use first active gym or body param
  if (!gymId && req.user.role === "super-admin") {
    gymId = req.body.gymId || req.body.gym;
    if (!gymId) {
      const gym = await Gym.findOne({ status: "active" }).sort({ createdAt: 1 });
      gymId = gym?._id;
    }
  }

  if (!gymId) return next(new AppError("Gym not found. Please link your account to a gym.", 404));

  const {
    title, description, category, scheduledAt, duration,
    maxParticipants, isFree, price, trainerId, trainerName, thumbnail,
  } = req.body;

  // Validate scheduled time is in the future
  if (new Date(scheduledAt) <= new Date()) {
    return next(new AppError("Scheduled time must be in the future.", 400));
  }

  // Create Zoom meeting
  let zoomData = { meetingId: "", joinUrl: "", startUrl: "", password: "" };

  if (zoomService.isConfigured()) {
    try {
      zoomData = await zoomService.createMeeting({
        topic:     title,
        agenda:    description || title,
        startTime: scheduledAt,
        duration:  duration || 60,
      });
      logger.info(`Zoom meeting created for class "${title}": ${zoomData.meetingId}`);
    } catch (zoomErr) {
      // Don't block class creation if Zoom fails — log and continue
      logger.warn(`Zoom meeting creation failed for "${title}": ${zoomErr.message}`);
    }
  } else {
    logger.warn("Zoom not configured — class created without Zoom meeting");
  }

  const liveClass = await LiveClass.create({
    gym:             gymId,
    createdBy:       req.user._id,
    trainer:         trainerId || null,
    trainerName:     trainerName || "",
    title,
    description:     description || "",
    category:        category || "Other",
    scheduledAt:     new Date(scheduledAt),
    duration:        duration || 60,
    maxParticipants: maxParticipants || 30,
    isFree:          isFree !== false,
    price:           isFree !== false ? 0 : (price || 0),
    thumbnail:       thumbnail || "",
    status:          "scheduled",
    zoomMeetingId:   zoomData.meetingId,
    zoomJoinUrl:     zoomData.joinUrl,
    zoomStartUrl:    zoomData.startUrl,
    zoomPassword:    zoomData.password,
  });

  // Notify gym members
  await createNotification({
    gym:      gymId,
    sender:   req.user._id,
    title:    "New Live Class Scheduled",
    message:  `${title} is scheduled for ${new Date(scheduledAt).toLocaleString("en-IN")}. Book your spot now!`,
    type:     "class",
    audience: "specific-gym",
    link:     `/gym-owner/live-classes/${liveClass._id}`,
  }).catch(() => {});

  res.status(201).json({ success: true, data: liveClass });
});

// @PUT /api/live-classes/:id
exports.updateLiveClass = asyncHandler(async (req, res, next) => {
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  // Gym owner can only update their own classes
  if (req.user.role === "gym-owner") {
    const gymId = await resolveGymId(req.user);
    if (lc.gym.toString() !== gymId?.toString()) {
      return next(new AppError("Not authorized to update this class.", 403));
    }
  }

  if (lc.status === "completed" || lc.status === "cancelled") {
    return next(new AppError("Cannot update a completed or cancelled class.", 400));
  }

  const allowed = ["title", "description", "category", "scheduledAt", "duration",
                   "maxParticipants", "isFree", "price", "trainerName", "trainer", "thumbnail", "status"];
  allowed.forEach(k => { if (req.body[k] !== undefined) lc[k] = req.body[k]; });

  // If no Zoom link yet and Zoom is configured — create one now
  if (!lc.zoomJoinUrl && zoomService.isConfigured()) {
    try {
      const zoomData = await zoomService.createMeeting({
        topic:     lc.title,
        agenda:    lc.description || lc.title,
        startTime: lc.scheduledAt,
        duration:  lc.duration || 60,
      });
      lc.zoomMeetingId = zoomData.meetingId;
      lc.zoomJoinUrl   = zoomData.joinUrl;
      lc.zoomStartUrl  = zoomData.startUrl;
      lc.zoomPassword  = zoomData.password;
      logger.info(`Zoom meeting created on update for "${lc.title}": ${zoomData.meetingId}`);
    } catch (zoomErr) {
      logger.warn(`Zoom meeting creation on update failed: ${zoomErr.message}`);
    }
  }

  await lc.save();
  res.json({ success: true, data: lc });
});

// @DELETE /api/live-classes/:id
exports.deleteLiveClass = asyncHandler(async (req, res, next) => {
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (req.user.role === "gym-owner") {
    const gymId = await resolveGymId(req.user);
    if (lc.gym.toString() !== gymId?.toString()) {
      return next(new AppError("Not authorized.", 403));
    }
  }

  // Cancel Zoom meeting if exists
  if (lc.zoomMeetingId) {
    await zoomService.deleteMeeting(lc.zoomMeetingId).catch(() => {});
  }

  // Cancel all bookings
  await LiveClassBooking.updateMany(
    { liveClass: lc._id, bookingStatus: "confirmed" },
    { bookingStatus: "cancelled" }
  );

  await LiveClass.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Live class deleted." });
});

// @POST /api/live-classes/:id/regenerate-zoom  (fix missing Zoom link)
exports.regenerateZoom = asyncHandler(async (req, res, next) => {
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (!zoomService.isConfigured()) {
    return next(new AppError("Zoom credentials not configured on server.", 503));
  }

  if (lc.status === "completed" || lc.status === "cancelled") {
    return next(new AppError("Cannot regenerate Zoom for a completed or cancelled class.", 400));
  }

  try {
    const zoomData = await zoomService.createMeeting({
      topic:     lc.title,
      agenda:    lc.description || lc.title,
      startTime: lc.scheduledAt,
      duration:  lc.duration || 60,
    });
    lc.zoomMeetingId = zoomData.meetingId;
    lc.zoomJoinUrl   = zoomData.joinUrl;
    lc.zoomStartUrl  = zoomData.startUrl;
    lc.zoomPassword  = zoomData.password;
    await lc.save();
    logger.info(`Zoom regenerated for "${lc.title}": ${zoomData.meetingId}`);
    res.json({ success: true, data: lc, message: "Zoom meeting link regenerated!" });
  } catch (err) {
    return next(new AppError(`Failed to create Zoom meeting: ${err.message}`, 500));
  }
});

// @POST /api/live-classes/:id/start  (gym-owner starts the class)
exports.startLiveClass = asyncHandler(async (req, res, next) => {
  if (!await canManage(req.user)) {
    return next(new AppError("Access denied.", 403));
  }
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (lc.status !== "scheduled") {
    return next(new AppError(`Cannot start a class with status: ${lc.status}`, 400));
  }

  lc.status    = "live";
  lc.startedAt = new Date();
  await lc.save();

  // Notify booked members
  await createNotification({
    gym:      lc.gym,
    sender:   req.user._id,
    title:    "🔴 Live Class Starting Now!",
    message:  `${lc.title} is starting now. Join via Zoom!`,
    type:     "class",
    audience: "specific-gym",
    link:     lc.zoomJoinUrl,
  }).catch(() => {});

  res.json({ success: true, data: lc, startUrl: lc.zoomStartUrl });
});

// @POST /api/live-classes/:id/complete  (gym-owner ends the class)
exports.completeLiveClass = asyncHandler(async (req, res, next) => {
  if (!await canManage(req.user)) {
    return next(new AppError("Access denied.", 403));
  }
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (lc.status !== "live") {
    return next(new AppError("Class is not currently live.", 400));
  }

  lc.status      = "completed";
  lc.completedAt = new Date();
  await lc.save();

  // Mark all "joined" bookings as completed
  await LiveClassBooking.updateMany(
    { liveClass: lc._id, attendanceStatus: "joined" },
    { attendanceStatus: "completed", completedAt: new Date() }
  );

  // Mark "not_joined" as absent
  await LiveClassBooking.updateMany(
    { liveClass: lc._id, attendanceStatus: "not_joined", bookingStatus: "confirmed" },
    { attendanceStatus: "absent" }
  );

  res.json({ success: true, data: lc });
});

// @POST /api/live-classes/:id/cancel
exports.cancelLiveClass = asyncHandler(async (req, res, next) => {
  if (!await canManage(req.user)) {
    return next(new AppError("Access denied.", 403));
  }
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (lc.status === "completed" || lc.status === "cancelled") {
    return next(new AppError("Class is already completed or cancelled.", 400));
  }

  lc.status       = "cancelled";
  lc.cancelledAt  = new Date();
  lc.cancelReason = req.body.reason || "";
  await lc.save();

  if (lc.zoomMeetingId) {
    await zoomService.deleteMeeting(lc.zoomMeetingId).catch(() => {});
  }

  await LiveClassBooking.updateMany(
    { liveClass: lc._id, bookingStatus: "confirmed" },
    { bookingStatus: "cancelled" }
  );

  await createNotification({
    gym:      lc.gym,
    sender:   req.user._id,
    title:    "Live Class Cancelled",
    message:  `${lc.title} has been cancelled. ${lc.cancelReason ? `Reason: ${lc.cancelReason}` : ""}`,
    type:     "alert",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, data: lc });
});

// @GET /api/live-classes/:id/bookings  (gym-owner views bookings)
exports.getClassBookings = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const filter = { liveClass: req.params.id };

  const total = await LiveClassBooking.countDocuments(filter);
  const { query, pagination } = paginate(
    LiveClassBooking.find(filter)
      .populate("member", "name email phone photo")
      .sort({ bookedAt: -1 }),
    { page, limit }
  );

  const bookings = await query;
  res.json({
    success: true,
    data: bookings,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ─────────────────────────────────────────────────────────────────
// MEMBER — BOOKING & JOINING
// ─────────────────────────────────────────────────────────────────

// @GET /api/live-classes/upcoming  (public — members browse)
exports.getUpcomingClasses = asyncHandler(async (req, res) => {
  const { gymId, category, page, limit } = req.query;

  // Include:
  // 1. Scheduled classes with future scheduledAt
  // 2. Live classes (already started — join now)
  const filter = {
    $or: [
      { status: "live" },                                          // currently live
      { status: "scheduled", scheduledAt: { $gte: new Date() } }, // future scheduled
    ],
  };

  if (gymId)    filter.gym      = gymId;
  if (category) filter.category = category;

  const total = await LiveClass.countDocuments(filter);
  const { query, pagination } = paginate(
    LiveClass.find(filter)
      .populate("trainer", "name photo specialty")
      .sort({ status: -1, scheduledAt: 1 }), // live classes first, then by date
    { page, limit }
  );

  const classes = await query;
  res.json({
    success: true,
    data: classes,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// @POST /api/live-classes/:id/book  (member books a class)
exports.bookClass = asyncHandler(async (req, res, next) => {
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (lc.status === "cancelled") return next(new AppError("This class has been cancelled.", 400));
  if (lc.status === "completed") return next(new AppError("This class has already ended.", 400));
  if (new Date(lc.scheduledAt) < new Date()) return next(new AppError("Booking window has closed.", 400));

  // Find member record for this user
  const member = await Member.findOne({ gym: lc.gym }).where("email").equals(req.user.email);
  if (!member) return next(new AppError("You are not a member of this gym.", 403));
  if (member.status !== "Active") return next(new AppError(`Your membership is ${member.status}. Please renew.`, 403));

  // Check seat availability
  if (lc.enrolledCount >= lc.maxParticipants) {
    return next(new AppError("This class is fully booked.", 400));
  }

  // Check duplicate booking
  const existing = await LiveClassBooking.findOne({ member: member._id, liveClass: lc._id });
  if (existing && existing.bookingStatus !== "cancelled") {
    return next(new AppError("You have already booked this class.", 400));
  }

  const gym = await Gym.findById(lc.gym).select("name");

  // ── Free class — direct booking ────────────────────────────────
  if (lc.isFree || lc.price === 0) {
    const booking = await LiveClassBooking.findOneAndUpdate(
      { member: member._id, liveClass: lc._id },
      {
        member:        member._id,
        gym:           lc.gym,
        liveClass:     lc._id,
        memberName:    member.name,
        memberEmail:   member.email,
        classTitle:    lc.title,
        gymName:       gym?.name || "",
        paymentAmount: 0,
        paymentMethod: "free",
        paymentStatus: "free",
        bookingStatus: "confirmed",
        bookedAt:      new Date(),
      },
      { upsert: true, new: true }
    );

    await LiveClass.findByIdAndUpdate(lc._id, { $inc: { enrolledCount: 1 } });

    await createNotification({
      recipient: req.user._id,
      gym:       lc.gym,
      title:     "Class Booked!",
      message:   `You've booked ${lc.title} on ${new Date(lc.scheduledAt).toLocaleString("en-IN")}`,
      type:      "class",
      audience:  "specific-gym",
      link:      lc.zoomJoinUrl,
    }).catch(() => {});

    return res.status(201).json({
      success:  true,
      data:     booking,
      joinUrl:  lc.zoomJoinUrl,
      message:  "Class booked successfully!",
    });
  }

  // ── Paid class — create Razorpay order ────────────────────────
  const Razorpay = require("razorpay");
  if (!process.env.RAZORPAY_KEY_ID) {
    return next(new AppError("Payment gateway not configured.", 503));
  }

  const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const order = await razorpay.orders.create({
    amount:   lc.price * 100,
    currency: "INR",
    receipt:  `lc_${lc._id}_${member._id}_${Date.now()}`,
    notes:    { liveClassId: lc._id.toString(), memberId: member._id.toString() },
  });

  // Create pending booking
  await LiveClassBooking.findOneAndUpdate(
    { member: member._id, liveClass: lc._id },
    {
      member:           member._id,
      gym:              lc.gym,
      liveClass:        lc._id,
      memberName:       member.name,
      memberEmail:      member.email,
      classTitle:       lc.title,
      gymName:          gym?.name || "",
      paymentAmount:    lc.price,
      paymentMethod:    "razorpay",
      paymentStatus:    "pending",
      bookingStatus:    "pending",
      razorpayOrderId:  order.id,
      bookedAt:         new Date(),
    },
    { upsert: true, new: true }
  );

  res.json({
    success:   true,
    requiresPayment: true,
    orderId:   order.id,
    amount:    order.amount,
    currency:  order.currency,
    keyId:     process.env.RAZORPAY_KEY_ID,
    classTitle: lc.title,
    memberName: member.name,
  });
});

// @POST /api/live-classes/:id/verify-payment  (confirm Razorpay payment)
exports.verifyPayment = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const crypto = require("crypto");

  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSig !== razorpay_signature) {
    return next(new AppError("Payment verification failed.", 400));
  }

  const booking = await LiveClassBooking.findOne({ razorpayOrderId: razorpay_order_id });
  if (!booking) return next(new AppError("Booking not found.", 404));

  const lc = await LiveClass.findById(booking.liveClass);
  if (!lc) return next(new AppError("Live class not found.", 404));

  // Record payment
  const payment = await Payment.create({
    gym:              booking.gym,
    member:           booking.member,
    memberName:       booking.memberName,
    gymName:          booking.gymName,
    amount:           booking.paymentAmount,
    type:             "Payment",
    status:           "Success",
    gateway:          "Razorpay",
    gatewayPaymentId: razorpay_payment_id,
    gatewayOrderId:   razorpay_order_id,
    description:      `Live class: ${booking.classTitle}`,
    paidAt:           new Date(),
  });

  // Confirm booking
  booking.paymentStatus    = "paid";
  booking.bookingStatus    = "confirmed";
  booking.paymentId        = payment._id;
  booking.razorpayPaymentId = razorpay_payment_id;
  await booking.save();

  await LiveClass.findByIdAndUpdate(lc._id, { $inc: { enrolledCount: 1 } });

  await createNotification({
    recipient: req.user._id,
    gym:       booking.gym,
    title:     "Payment Successful — Class Booked!",
    message:   `₹${booking.paymentAmount} paid for ${booking.classTitle}`,
    type:      "payment",
    audience:  "specific-gym",
    link:      lc.zoomJoinUrl,
  }).catch(() => {});

  res.json({
    success:  true,
    data:     booking,
    joinUrl:  lc.zoomJoinUrl,
    message:  "Payment verified and class booked!",
  });
});

// @POST /api/live-classes/:id/join  (member joins — marks attendance)
exports.joinClass = asyncHandler(async (req, res, next) => {
  const lc = await LiveClass.findById(req.params.id);
  if (!lc) return next(new AppError("Live class not found.", 404));

  if (lc.status !== "live" && lc.status !== "scheduled") {
    return next(new AppError("Class is not available to join.", 400));
  }

  const member = await Member.findOne({ gym: lc.gym }).where("email").equals(req.user.email);
  if (!member) return next(new AppError("You are not a member of this gym.", 403));

  const booking = await LiveClassBooking.findOne({
    member:        member._id,
    liveClass:     lc._id,
    bookingStatus: "confirmed",
  });

  if (!booking) return next(new AppError("You have not booked this class.", 403));

  if (booking.attendanceStatus === "not_joined") {
    booking.attendanceStatus = "joined";
    booking.joinedAt         = new Date();
    await booking.save();
  }

  res.json({
    success: true,
    joinUrl: lc.zoomJoinUrl,
    message: "Attendance marked. Redirecting to Zoom...",
  });
});

// ─────────────────────────────────────────────────────────────────
// MEMBER ANALYTICS
// ─────────────────────────────────────────────────────────────────

// @GET /api/live-classes/member/history  (last 30 days attendance)
exports.getMemberHistory = asyncHandler(async (req, res) => {
  const member = await Member.findOne({ gym: req.query.gymId }).where("email").equals(req.user.email);
  if (!member) return res.json({ success: true, data: { bookings: [], stats: {} } });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const bookings = await LiveClassBooking.find({
    member:   member._id,
    bookedAt: { $gte: thirtyDaysAgo },
  })
    .populate("liveClass", "title scheduledAt duration category status thumbnail")
    .sort({ bookedAt: -1 });

  const stats = {
    total:      bookings.length,
    completed:  bookings.filter(b => b.attendanceStatus === "completed").length,
    missed:     bookings.filter(b => b.attendanceStatus === "absent").length,
    upcoming:   bookings.filter(b => b.attendanceStatus === "not_joined" && b.bookingStatus === "confirmed").length,
    attendanceRate: bookings.length > 0
      ? Math.round((bookings.filter(b => b.attendanceStatus === "completed").length / bookings.length) * 100)
      : 0,
  };

  res.json({ success: true, data: { bookings, stats } });
});

// @GET /api/live-classes/member/spending  (monthly spending)
exports.getMemberSpending = asyncHandler(async (req, res) => {
  const member = await Member.findOne({ gym: req.query.gymId }).where("email").equals(req.user.email);
  if (!member) return res.json({ success: true, data: { payments: [], stats: {} } });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const bookings = await LiveClassBooking.find({
    member:        member._id,
    bookedAt:      { $gte: thirtyDaysAgo },
    paymentStatus: { $in: ["paid", "free"] },
  })
    .populate("liveClass", "title scheduledAt category")
    .sort({ bookedAt: -1 });

  const paidBookings = bookings.filter(b => b.paymentStatus === "paid");
  const totalSpent   = paidBookings.reduce((s, b) => s + b.paymentAmount, 0);

  const stats = {
    totalSpent,
    paidClasses:    paidBookings.length,
    freeClasses:    bookings.filter(b => b.paymentStatus === "free").length,
    averageSpend:   paidBookings.length > 0 ? Math.round(totalSpent / paidBookings.length) : 0,
    lastPaymentDate: paidBookings[0]?.bookedAt || null,
  };

  res.json({ success: true, data: { bookings, stats } });
});

// ─────────────────────────────────────────────────────────────────
// GYM OWNER ANALYTICS
// ─────────────────────────────────────────────────────────────────

// @GET /api/live-classes/analytics  (gym-owner revenue + attendance)
exports.getAnalytics = asyncHandler(async (req, res) => {
  if (!await canManage(req.user)) {
    return res.json({ success: true, data: {} });
  }
  const gymId = await resolveGymId(req.user);
  if (!gymId) return res.json({ success: true, data: {} });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [totalClasses, completedClasses, totalBookings, revenue] = await Promise.all([
    LiveClass.countDocuments({ gym: gymId }),
    LiveClass.countDocuments({ gym: gymId, status: "completed" }),
    LiveClassBooking.countDocuments({ gym: gymId, bookingStatus: "confirmed" }),
    LiveClassBooking.aggregate([
      { $match: { gym: gymId, paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$paymentAmount" } } },
    ]),
  ]);

  // Monthly bookings trend (last 6 months)
  const now = new Date();
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const count = await LiveClassBooking.countDocuments({
      gym: gymId, bookedAt: { $gte: start, $lte: end },
    });
    monthlyTrend.push({
      month: start.toLocaleString("default", { month: "short" }),
      count,
    });
  }

  res.json({
    success: true,
    data: {
      totalClasses,
      completedClasses,
      totalBookings,
      totalRevenue: revenue[0]?.total || 0,
      monthlyTrend,
    },
  });
});
