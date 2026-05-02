const Notification = require("../models/Notification");
const { getIO } = require("../sockets");
const logger = require("../utils/logger");

// ── Events that should also notify super-admin ─────────────────────
const SUPER_ADMIN_EVENTS = new Set([
  "member", "payment", "trainer", "gym", "alert", "class",
]);

/**
 * Create a notification and emit via Socket.io.
 * If audience is "specific-gym" and type is important,
 * also creates a mirrored "super-admin" notification.
 */
exports.createNotification = async ({
  recipient = null,
  gym = null,
  sender = null,
  title,
  message,
  type = "system",
  audience = "all",
  channel = "in-app",
  link = "",
  data = {},
}) => {
  try {
    const notification = await Notification.create({
      recipient, gym, sender, title, message, type, audience, channel, link, data,
    });

    // ── Mirror to super-admin for important gym events ─────────────
    if (audience === "specific-gym" && SUPER_ADMIN_EVENTS.has(type)) {
      await Notification.create({
        recipient: null,
        gym,
        sender,
        title,
        message,
        type,
        audience: "super-admin",
        channel:  "in-app",
        link,
        data,
      }).catch(() => {});
    }

    // ── Emit real-time via Socket.io ───────────────────────────────
    const io = getIO();
    if (io) {
      if (recipient) {
        io.to(`user:${recipient}`).emit("notification", notification);
      } else if (gym) {
        io.to(`gym:${gym}`).emit("notification", notification);
      } else {
        io.emit("notification", notification);
      }
      // Always emit to super-admin room for important events
      if (SUPER_ADMIN_EVENTS.has(type)) {
        io.to("role:super-admin").emit("notification", notification);
      }
    }

    return notification;
  } catch (err) {
    logger.error(`Notification creation failed: ${err.message}`);
  }
};

/**
 * Broadcast to all gym owners
 */
exports.broadcastToGymOwners = async (title, message, type = "system") => {
  return exports.createNotification({ title, message, type, audience: "gym-owners" });
};

/**
 * Notify specific gym
 */
exports.notifyGym = async (gymId, title, message, type = "system") => {
  return exports.createNotification({ gym: gymId, title, message, type, audience: "specific-gym" });
};
