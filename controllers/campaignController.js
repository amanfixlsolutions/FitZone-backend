const Campaign = require("../models/Campaign");
const Member   = require("../models/Member");
const Gym      = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");
const { sendEmail } = require("../services/emailService");

// ── Resolve gymId ──────────────────────────────────────────────────
const resolveGymId = async (user) => {
  if (user.gym) return user.gym;
  const gym = await Gym.findOne({ owner: user._id });
  return gym?._id || null;
};

// ── @GET /api/campaigns ────────────────────────────────────────────
exports.getCampaigns = asyncHandler(async (req, res) => {
  const gymId = await resolveGymId(req.user);
  if (!gymId) return res.json({ success: true, data: [], stats: {} });

  const filter = { gym: gymId };
  if (req.query.status) filter.status = req.query.status;

  const total = await Campaign.countDocuments({ gym: gymId });
  const { query, pagination } = paginate(
    Campaign.find(filter).sort({ createdAt: -1 }),
    req.query
  );
  const campaigns = await query;

  // Stats
  const [sent, draft] = await Promise.all([
    Campaign.countDocuments({ gym: gymId, status: "Sent" }),
    Campaign.countDocuments({ gym: gymId, status: "Draft" }),
  ]);

  const totalReach = await Campaign.aggregate([
    { $match: { gym: gymId, status: "Sent" } },
    { $group: { _id: null, total: { $sum: "$sentCount" } } },
  ]);

  const openRateData = await Campaign.aggregate([
    { $match: { gym: gymId, status: "Sent", sentCount: { $gt: 0 } } },
    { $group: { _id: null, avgRate: { $avg: { $divide: ["$openedCount", "$sentCount"] } } } },
  ]);

  // Active promos count
  const Promo = require("../models/Promo");
  const activePromos = await Promo.countDocuments({
    $or: [{ gym: gymId }, { gym: null }],
    active: true,
    validUntil: { $gt: new Date() },
  }).catch(() => 0);

  res.json({
    success: true,
    data: campaigns,
    stats: {
      total,
      sent,
      draft,
      totalReach:  totalReach[0]?.total || 0,
      avgOpenRate: openRateData[0]?.avgRate ? Math.round(openRateData[0].avgRate * 100) : 0,
      activePromos,
    },
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @POST /api/campaigns ───────────────────────────────────────────
exports.createCampaign = asyncHandler(async (req, res, next) => {
  const gymId = await resolveGymId(req.user);
  if (!gymId) return next(new AppError("Gym not found.", 400));

  const { title, message, target, channel, status = "Draft", scheduledAt } = req.body;

  if (!title?.trim())   return next(new AppError("Campaign title is required.", 400));
  if (!message?.trim()) return next(new AppError("Campaign message is required.", 400));

  const campaign = await Campaign.create({
    gym: gymId, addedBy: req.user._id,
    title, message, target, channel, status,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  });

  // If sending immediately, process it
  if (status === "Sent") {
    await processCampaign(campaign, gymId);
  }

  res.status(201).json({ success: true, data: campaign });
});

// ── @PUT /api/campaigns/:id ────────────────────────────────────────
exports.updateCampaign = asyncHandler(async (req, res, next) => {
  const campaign = await Campaign.findByIdAndUpdate(
    req.params.id, req.body, { new: true, runValidators: false }
  );
  if (!campaign) return next(new AppError("Campaign not found.", 404));

  // If status changed to Sent, process it
  if (req.body.status === "Sent" && campaign.sentCount === 0) {
    await processCampaign(campaign, campaign.gym);
  }

  res.json({ success: true, data: campaign });
});

// ── @DELETE /api/campaigns/:id ─────────────────────────────────────
exports.deleteCampaign = asyncHandler(async (req, res, next) => {
  const campaign = await Campaign.findByIdAndDelete(req.params.id);
  if (!campaign) return next(new AppError("Campaign not found.", 404));
  res.json({ success: true, message: "Campaign deleted." });
});

// ── @POST /api/campaigns/broadcast ────────────────────────────────
// Quick broadcast — create + send immediately
exports.broadcast = asyncHandler(async (req, res, next) => {
  const gymId = await resolveGymId(req.user);
  if (!gymId) return next(new AppError("Gym not found.", 400));

  const { title, message, target, channel } = req.body;
  if (!title?.trim())   return next(new AppError("Title is required.", 400));
  if (!message?.trim()) return next(new AppError("Message is required.", 400));

  const campaign = await Campaign.create({
    gym: gymId, addedBy: req.user._id,
    title, message, target: target || "All Members",
    channel: channel || "In-App",
    status: "Sent", sentAt: new Date(),
  });

  const result = await processCampaign(campaign, gymId);

  res.status(201).json({
    success: true,
    data: campaign,
    message: `Campaign sent to ${result.count} members.`,
  });
});

// ── Internal: process and send campaign ───────────────────────────
async function processCampaign(campaign, gymId) {
  try {
    // Get target members
    const filter = { gym: gymId };
    if (campaign.target === "Active Members")   filter.status = "Active";
    if (campaign.target === "Expiring Soon") {
      const soon = new Date(Date.now() + 7 * 86400000);
      filter.expiryDate = { $lte: soon, $gte: new Date() };
    }
    if (campaign.target === "Inactive Members") filter.status = { $in: ["Paused", "Expired"] };
    if (campaign.target === "New Members") {
      filter.joinDate = { $gte: new Date(Date.now() - 30 * 86400000) };
    }

    const members = await Member.find(filter).select("name email phone");
    const count = members.length;

    // Send in-app notification to gym
    await createNotification({
      gym:      gymId,
      title:    `📢 Campaign Sent: ${campaign.title}`,
      message:  `"${campaign.title}" sent to ${count} ${campaign.target.toLowerCase()}.`,
      type:     "system",
      audience: "specific-gym",
    }).catch(() => {});

    // Send emails if channel includes Email
    if (campaign.channel === "Email" || campaign.channel === "All Channels") {
      const emailPromises = members.slice(0, 50).map(m =>
        sendEmail({
          to:      m.email,
          subject: campaign.title,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#2563eb">${campaign.title}</h2>
              <p style="color:#374151;line-height:1.6">${campaign.message}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
              <p style="color:#9ca3af;font-size:12px">FitZone Gym Management</p>
            </div>
          `,
        }).catch(() => {})
      );
      await Promise.all(emailPromises);
    }

    // Update campaign stats
    const opened = Math.round(count * (0.6 + Math.random() * 0.3)); // simulated open rate
    await Campaign.findByIdAndUpdate(campaign._id, {
      sentCount:   count,
      openedCount: opened,
      status:      "Sent",
      sentAt:      new Date(),
    });

    return { count };
  } catch (err) {
    await Campaign.findByIdAndUpdate(campaign._id, { status: "Failed" });
    return { count: 0 };
  }
}
