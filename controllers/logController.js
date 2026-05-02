const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");

exports.getLogs = asyncHandler(async (req, res) => {
  const { module, action, userId, from, to } = req.query;
  const filter = {};

  if (module) filter.module = module;
  if (action) filter.action = new RegExp(action, "i");
  if (userId) filter.user = userId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to)   filter.createdAt.$lte = new Date(to);
  }

  // Gym owner sees only their gym's logs
  if (req.user.role === "gym-owner") filter.gym = req.user.gym;

  const total = await ActivityLog.countDocuments(filter);
  const { query, pagination } = paginate(
    ActivityLog.find(filter).populate("user", "name email role").sort({ createdAt: -1 }),
    req.query
  );

  const logs = await query;
  res.json({
    success: true,
    data: logs,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

exports.clearLogs = asyncHandler(async (req, res) => {
  const { before } = req.body;
  const filter = before ? { createdAt: { $lt: new Date(before) } } : {};
  await ActivityLog.deleteMany(filter);
  res.json({ success: true, message: "Logs cleared." });
});
