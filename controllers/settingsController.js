const Settings = require("../models/Settings");
const Gym = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Resolve gymId (handles null gym on user) ───────────────────────
const resolveGymId = async (user) => {
  if (user.gym) return user.gym;
  const gym = await Gym.findOne({ owner: user._id });
  return gym?._id || null;
};

// ── @GET /api/settings/public — no auth, returns gym contact info ──
exports.getPublicSettings = asyncHandler(async (req, res) => {
  // Try active gym first, then any gym
  let gym = await Gym.findOne({ status: "active" }).sort({ createdAt: 1 });
  if (!gym) gym = await Gym.findOne().sort({ createdAt: 1 });

  // Try gym-specific settings, then platform settings
  let settings = null;
  if (gym) settings = await Settings.findOne({ gym: gym._id });
  if (!settings) settings = await Settings.findOne({ gym: null });

  const gs = settings?.gym_settings || {};
  const timings = settings?.timings;
  const oh = gym?.openingHours;

  const fmt = (t) => {
    if (!t) return null;
    if (t.closed) return "Closed";
    return `${t.open || "06:00"} – ${t.close || "22:00"}`;
  };

  // Build timings — prefer Settings.timings, fallback to Gym.openingHours
  let timingsOut = {};
  if (timings) {
    const monFri = fmt(timings.monday);
    const sat    = fmt(timings.saturday);
    const sun    = fmt(timings.sunday);
    if (monFri) timingsOut["Mon – Fri"] = monFri;
    if (sat)    timingsOut["Saturday"]  = sat;
    if (sun)    timingsOut["Sunday"]    = sun;
  } else if (oh) {
    if (oh.weekdays) timingsOut["Mon – Fri"] = fmt(oh.weekdays);
    if (oh.saturday) timingsOut["Saturday"]  = fmt(oh.saturday);
    if (oh.sunday)   timingsOut["Sunday"]    = fmt(oh.sunday);
  }

  // Final fallback defaults
  if (!Object.keys(timingsOut).length) {
    timingsOut = {
      "Mon – Fri": "05:30 – 23:00",
      "Saturday":  "06:00 – 22:00",
      "Sunday":    "07:00 – 21:00",
    };
  }

  res.json({
    success: true,
    data: {
      gymName:     gs.gymName     || gym?.name        || "FitZone",
      email:       gs.email       || gym?.email       || "hello@fitzone.in",
      phone:       gs.phone       || gym?.phone       || "+91 98765 43210",
      address:     gs.address     || gym?.address     || "123 Fitness Avenue",
      city:        gs.city        || gym?.city        || "Mumbai",
      description: gs.description || gym?.description || "",
      website:     gs.website     || "",
      timings:     timingsOut,
    },
  });
});

// ── @POST /api/settings/contact — public contact form submission ───
exports.submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: "Name, email and message are required." });
  }

  // Save as a notification to gym owner / super admin
  const { createNotification } = require("../services/notificationService");
  const gym = await Gym.findOne({ status: "active" }).sort({ createdAt: 1 });

  await createNotification({
    gym:      gym?._id || null,
    title:    `📩 Contact: ${subject || "General Inquiry"}`,
    message:  `From: ${name} (${email}${phone ? ", " + phone : ""}) — ${message.slice(0, 200)}`,
    type:     "alert",
    audience: gym ? "specific-gym" : "super-admin",
  }).catch(() => {});

  // Try to send email if email service is configured
  try {
    const { sendEmail } = require("../services/emailService");
    await sendEmail({
      to:      process.env.CONTACT_EMAIL || gym?.email || email,
      subject: `[FitZone Contact] ${subject || "New Message"} from ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}
        <p><strong>Subject:</strong> ${subject || "—"}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
      `,
    });
  } catch { /* email optional — don't fail the request */ }

  res.json({ success: true, message: "Message received! We'll get back to you within 24 hours." });
});

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
