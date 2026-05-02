const Settings = require("../models/Settings");
const Gym = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Resolve gymId (handles null gym on user) ───────────────────────
const resolveGymId = async (user) => {
  if (user.gym) return user.gym;
  const gym = await Gym.findOne({ owner: user._id });
  return gym?._id || null;
};

// ── @GET /api/settings ─────────────────────────────────────────────
exports.getSettings = asyncHandler(async (req, res) => {
  const gymId = req.user.role === "gym-owner"
    ? await resolveGymId(req.user)
    : null;

  let settings = await Settings.findOne({ gym: gymId });

  if (!settings) {
    // Auto-populate from Gym document if available
    const gymData = gymId ? await Gym.findById(gymId) : null;
    settings = await Settings.create({
      gym: gymId,
      gym_settings: gymData ? {
        gymName:   gymData.name     || "",
        ownerName: gymData.ownerName|| "",
        email:     gymData.email    || "",
        phone:     gymData.phone    || "",
        address:   gymData.address  || "",
        city:      gymData.city     || "",
      } : {},
    });
  }

  res.json({ success: true, data: settings });
});

// ── @PUT /api/settings ─────────────────────────────────────────────
exports.updateSettings = asyncHandler(async (req, res) => {
  const gymId = req.user.role === "gym-owner"
    ? await resolveGymId(req.user)
    : null;

  const settings = await Settings.findOneAndUpdate(
    { gym: gymId },
    { $set: req.body },
    { new: true, upsert: true, runValidators: false }
  );

  // Also update Gym document with profile changes
  if (gymId && req.body.gym_settings) {
    const gs = req.body.gym_settings;
    const gymUpdate = {};
    if (gs.gymName)   gymUpdate.name      = gs.gymName;
    if (gs.email)     gymUpdate.email     = gs.email;
    if (gs.phone)     gymUpdate.phone     = gs.phone;
    if (gs.address)   gymUpdate.address   = gs.address;
    if (gs.city)      gymUpdate.city      = gs.city;
    if (Object.keys(gymUpdate).length) {
      await Gym.findByIdAndUpdate(gymId, gymUpdate);
    }
  }

  res.json({ success: true, data: settings, message: "Settings saved successfully." });
});
