const Notification = require("../models/Notification");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");

// ── @GET /api/notifications ────────────────────────────────────────
exports.getNotifications = asyncHandler(async (req, res) => {
  const filter = {};
  const mongoose = require("mongoose");

  if (req.user.role === "super-admin") {
    filter.$or = [
      { audience: "super-admin" },
      { audience: "all" },
    ];

  } else if (req.user.role === "gym-owner") {
    let gymId = req.user.gym;
    if (!gymId) {
      const Gym = require("../models/Gym");
      const gym = await Gym.findOne({ owner: req.user._id });
      gymId = gym?._id;
    }
    if (gymId) {
      const gymObjId = mongoose.Types.ObjectId.isValid(gymId)
        ? new mongoose.Types.ObjectId(gymId.toString())
        : gymId;
      filter.$or = [
        { gym: gymObjId },
        { audience: "gym-owners" },
        { audience: "all" },
      ];
    } else {
      filter.$or = [{ audience: "gym-owners" }, { audience: "all" }];
    }

  } else {
    // member — show notifications addressed to them or their gym or "all"
    const conditions = [
      { audience: "all" },
      { recipient: req.user._id },
    ];
    // If member has a gym, include gym-specific notifications
    if (req.user.gym) {
      const gymObjId = mongoose.Types.ObjectId.isValid(req.user.gym)
        ? new mongoose.Types.ObjectId(req.user.gym.toString())
        : req.user.gym;
      conditions.push({ gym: gymObjId, audience: "specific-gym" });
    }
    filter.$or = conditions;
  }

  if (req.query.unread === "true") filter.read = false;

  const total = await Notification.countDocuments(filter);
  const { query, pagination } = paginate(
    Notification.find(filter).sort({ createdAt: -1 }),
    req.query
  );

  const notifications = await query;
  const unreadCount = await Notification.countDocuments({ ...filter, read: false });

  res.json({
    success: true,
    data: notifications,
    unreadCount,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @POST /api/notifications/broadcast ────────────────────────────
exports.broadcast = asyncHandler(async (req, res) => {
  const { title, message, audience, channel, type } = req.body;

  const notification = await createNotification({
    sender: req.user._id,
    title,
    message,
    audience,
    channel,
    type: type || "system",
  });

  res.status(201).json({ success: true, data: notification });
});

// ── @PATCH /api/notifications/:id/read ────────────────────────────
exports.markRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return next(new AppError("Notification not found.", 404));

  // ── Ownership check — user can only mark their own notifications ─
  const mongoose = require("mongoose");
  const userGymId = req.user.gym
    ? (mongoose.Types.ObjectId.isValid(req.user.gym) ? req.user.gym.toString() : null)
    : null;
  const notifGymId = notification.gym
    ? notification.gym.toString()
    : null;

  const isOwner =
    // Personal notification addressed to this user
    (notification.recipient && notification.recipient.toString() === req.user._id.toString()) ||
    // Gym-scoped notification for this user's gym
    (notifGymId && userGymId && notifGymId === userGymId) ||
    // Broadcast to all
    notification.audience === "all" ||
    // Super-admin can mark any
    req.user.role === "super-admin" ||
    // Gym-owner notifications
    (req.user.role === "gym-owner" && notification.audience === "gym-owners") ||
    // Super-admin audience
    (req.user.role === "super-admin" && notification.audience === "super-admin");

  if (!isOwner) return next(new AppError("Not authorized to update this notification.", 403));

  notification.read   = true;
  notification.readAt = new Date();
  await notification.save();

  res.json({ success: true, data: notification });
});

// ── @PATCH /api/notifications/read-all ────────────────────────────
exports.markAllRead = asyncHandler(async (req, res) => {
  const mongoose = require("mongoose");
  const filter = {};

  if (req.user.role === "gym-owner") {
    let gymId = req.user.gym;
    if (!gymId) {
      const Gym = require("../models/Gym");
      const gym = await Gym.findOne({ owner: req.user._id });
      gymId = gym?._id;
    }
    if (gymId) {
      const gymObjId = mongoose.Types.ObjectId.isValid(gymId)
        ? new mongoose.Types.ObjectId(gymId.toString())
        : gymId;
      filter.gym = gymObjId;
    }
  } else if (req.user.role === "member") {
    // Only mark notifications relevant to this member
    filter.$or = [
      { recipient: req.user._id },
      { audience: "all" },
    ];
    if (req.user.gym) {
      const gymObjId = mongoose.Types.ObjectId.isValid(req.user.gym)
        ? new mongoose.Types.ObjectId(req.user.gym.toString())
        : req.user.gym;
      filter.$or.push({ gym: gymObjId, audience: "specific-gym" });
    }
  }

  await Notification.updateMany({ ...filter, read: false }, { read: true, readAt: new Date() });
  res.json({ success: true, message: "All notifications marked as read." });
});

// ── @DELETE /api/notifications/:id ────────────────────────────────
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return next(new AppError("Notification not found.", 404));

  // ── Ownership check — only gym-owner of that gym or super-admin can delete ─
  if (req.user.role !== "super-admin") {
    const userGymId = req.user.gym?.toString();
    const notifGymId = notification.gym?.toString();
    if (!userGymId || !notifGymId || userGymId !== notifGymId) {
      return next(new AppError("Not authorized to delete this notification.", 403));
    }
  }

  await Notification.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Notification deleted." });
});
