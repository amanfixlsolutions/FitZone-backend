const Trainer = require("../models/Trainer");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");

// ── @GET /api/trainers ─────────────────────────────────────────────
exports.getTrainers = asyncHandler(async (req, res) => {
  const { status, specialty, search, gymId } = req.query;
  const filter = {};

  // Public access (no auth) — show only Active trainers
  if (!req.user) {
    filter.status = "Active";
  } else if (req.user.role === "gym-owner") {
    filter.gym = req.user.gym;
  } else if (gymId) {
    filter.gym = gymId;
  }

  if (status && req.user) filter.status = status; // only override if authenticated
  if (specialty) filter.specialty = new RegExp(specialty, "i");
  if (search)    filter.$or = [
    { name: new RegExp(search, "i") },
    { specialty: new RegExp(search, "i") },
    { email: new RegExp(search, "i") },
  ];

  const total = await Trainer.countDocuments(filter);
  const { query, pagination } = paginate(
    Trainer.find(filter).sort({ createdAt: -1 }),
    req.query
  );

  const trainers = await query;
  res.json({
    success: true,
    data: trainers,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/trainers/:id ─────────────────────────────────────────
exports.getTrainer = asyncHandler(async (req, res, next) => {
  const trainer = await Trainer.findById(req.params.id).populate("gym", "name city");
  if (!trainer) return next(new AppError("Trainer not found.", 404));
  res.json({ success: true, data: trainer });
});

// ── @POST /api/trainers ────────────────────────────────────────────
exports.createTrainer = asyncHandler(async (req, res) => {
  let gymId = req.user.role === "gym-owner" ? req.user.gym : req.body.gym;
  if (!gymId && req.user.role === "gym-owner") {
    const Gym = require("../models/Gym");
    const gym = await Gym.findOne({ owner: req.user._id });
    if (gym) gymId = gym._id;
  }

  const trainer = await Trainer.create({
    ...req.body,
    gym: gymId,
    addedBy: req.user._id,
  });

  await ActivityLog.create({
    user: req.user._id, userName: req.user.name, role: req.user.role,
    action: "ADD_TRAINER", module: "Trainers",
    details: `Added trainer: ${trainer.name}`,
  });

  // ── Notification ──────────────────────────────────────────────
  await createNotification({
    gym:      gymId,
    sender:   req.user._id,
    title:    "New Trainer Added",
    message:  `${trainer.name} (${trainer.specialty}) has been added to your gym.`,
    type:     "trainer",
    audience: "specific-gym",
  }).catch(() => {});

  res.status(201).json({ success: true, data: trainer });
});

// ── @PUT /api/trainers/:id ─────────────────────────────────────────
exports.updateTrainer = asyncHandler(async (req, res, next) => {
  const trainer = await Trainer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!trainer) return next(new AppError("Trainer not found.", 404));

  // ── Notification ──────────────────────────────────────────────
  await createNotification({
    gym:      trainer.gym,
    sender:   req.user._id,
    title:    "Trainer Profile Updated",
    message:  `${trainer.name}'s profile has been updated.`,
    type:     "trainer",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, data: trainer });
});

// ── @DELETE /api/trainers/:id ──────────────────────────────────────
exports.deleteTrainer = asyncHandler(async (req, res, next) => {
  const trainer = await Trainer.findByIdAndDelete(req.params.id);
  if (!trainer) return next(new AppError("Trainer not found.", 404));

  // ── Notification ──────────────────────────────────────────────
  await createNotification({
    gym:      trainer.gym,
    sender:   req.user._id,
    title:    "Trainer Removed",
    message:  `${trainer.name} has been removed from your gym.`,
    type:     "trainer",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Trainer deleted." });
});

// ── @POST /api/trainers/:id/verify ────────────────────────────────
exports.verifyTrainer = asyncHandler(async (req, res, next) => {
  const trainer = await Trainer.findByIdAndUpdate(
    req.params.id, { verified: true }, { new: true }
  );
  if (!trainer) return next(new AppError("Trainer not found.", 404));

  await createNotification({
    gym:      trainer.gym,
    sender:   req.user._id,
    title:    "Trainer Verified ✓",
    message:  `${trainer.name} has been verified by the platform.`,
    type:     "trainer",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Trainer verified.", data: trainer });
});
