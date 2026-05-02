const Notification = require("../models/Notification");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");

// ── @GET /api/notifications ────────────────────────────────────────
exports.getNotifications = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.user.role === "gym-owner") {
    // Handle gym as ObjectId or string
    const mongoose = require("mongoose");
    let gymId = req.user.gym;

    // If gym not on user, look it up
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
  } else if (req.user.role === "super-admin") {
    filter.$or = [
      { audience: "super-admin" },
      { audience: "all" },
    ];
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
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { read: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) return next(new AppError("Notification not found.", 404));
  res.json({ success: true, data: notification });
});

// ── @PATCH /api/notifications/read-all ────────────────────────────
exports.markAllRead = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === "gym-owner") {
    let gymId = req.user.gym;
    if (!gymId) {
      const Gym = require("../models/Gym");
      const gym = await Gym.findOne({ owner: req.user._id });
      gymId = gym?._id;
    }
    if (gymId) filter.gym = gymId;
  }
  await Notification.updateMany(filter, { read: true, readAt: new Date() });
  res.json({ success: true, message: "All notifications marked as read." });
});

// ── @DELETE /api/notifications/:id ────────────────────────────────
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);
  if (!notification) return next(new AppError("Notification not found.", 404));
  res.json({ success: true, message: "Notification deleted." });
});
