const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const logger = require("../utils/logger");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin:      process.env.CLIENT_URL || "http://localhost:3000",
      methods:     ["GET", "POST"],
      credentials: true,
    },
  });

  // ── Auth middleware — reads httpOnly cookie ────────────────────
  io.use((socket, next) => {
    try {
      // Try cookie first
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const token   = cookies.fitzone_access_token
        || socket.handshake.auth?.token
        || socket.handshake.query?.token;

      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`🔌 Socket connected: ${socket.id} | User: ${socket.userId}`);

    // ── Join personal room ─────────────────────────────────────
    socket.join(`user:${socket.userId}`);

    // ── Join role-based room (super-admin gets all events) ─────
    socket.on("join-role", (role) => {
      socket.join(`role:${role}`);
      logger.info(`Socket ${socket.id} joined role:${role}`);
    });

    // ── Join gym room (gym owner / admin) ──────────────────────
    socket.on("join-gym", (gymId) => {
      socket.join(`gym:${gymId}`);
      logger.info(`Socket ${socket.id} joined gym:${gymId}`);
    });

    // ── Join live class room ───────────────────────────────────
    socket.on("join-class", ({ classId, userName }) => {
      socket.join(`class:${classId}`);
      // Notify others in the class
      socket.to(`class:${classId}`).emit("user-joined-class", {
        userId: socket.userId,
        userName,
        timestamp: new Date(),
      });
      logger.info(`Socket ${socket.id} joined class:${classId}`);
    });

    // ── Leave live class room ──────────────────────────────────
    socket.on("leave-class", ({ classId, userName }) => {
      socket.leave(`class:${classId}`);
      socket.to(`class:${classId}`).emit("user-left-class", {
        userId: socket.userId,
        userName,
        timestamp: new Date(),
      });
    });

    // ── Live class chat message ────────────────────────────────
    socket.on("class-message", ({ classId, message, userName }) => {
      io.to(`class:${classId}`).emit("class-message", {
        userId:    socket.userId,
        userName,
        message,
        timestamp: new Date(),
      });
    });

    // ── Real-time check-in broadcast ───────────────────────────
    socket.on("checkin-event", (data) => {
      if (data.gymId) {
        io.to(`gym:${data.gymId}`).emit("checkin", data);
      }
    });

    // ── Zoom meeting started ───────────────────────────────────
    socket.on("meeting-started", ({ gymId, meetingId, topic, joinUrl }) => {
      io.to(`gym:${gymId}`).emit("meeting-started", {
        meetingId, topic, joinUrl,
        startedBy: socket.userId,
        timestamp: new Date(),
      });
    });

    // ── Disconnect ─────────────────────────────────────────────
    socket.on("disconnect", () => {
      logger.info(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  logger.info("✅ Socket.io initialized");
  return io;
};

const getIO = () => io;

// ── Emit to specific user ──────────────────────────────────────────
const emitToUser = (userId, event, data) => {
  if (io) io.to(`user:${userId}`).emit(event, data);
};

// ── Emit to gym ────────────────────────────────────────────────────
const emitToGym = (gymId, event, data) => {
  if (io) io.to(`gym:${gymId}`).emit(event, data);
};

// ── Broadcast to all ───────────────────────────────────────────────
const broadcast = (event, data) => {
  if (io) io.emit(event, data);
};

module.exports = { initSocket, getIO, emitToUser, emitToGym, broadcast };
