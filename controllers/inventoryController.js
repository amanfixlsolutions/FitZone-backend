const Inventory = require("../models/Inventory");
const Gym = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { createNotification } = require("../services/notificationService");

// ── Helper: resolve gymId for gym-owner ───────────────────────────
const resolveGymId = async (user) => {
  if (user.gym) return user.gym;
  const gym = await Gym.findOne({ owner: user._id });
  return gym?._id || null;
};

// ── @GET /api/inventory ────────────────────────────────────────────
exports.getInventory = asyncHandler(async (req, res) => {
  const { category, status, search } = req.query;
  const gymId = req.user.role === "gym-owner"
    ? await resolveGymId(req.user)
    : req.query.gymId;

  if (!gymId) return res.json({ success: true, data: [], stats: {} });

  const filter = { gym: gymId };
  if (category) filter.category = category;
  if (status)   filter.status   = status;
  if (search)   filter.$or = [
    { name:        new RegExp(search, "i") },
    { category:    new RegExp(search, "i") },
    { description: new RegExp(search, "i") },
  ];

  const total = await Inventory.countDocuments({ gym: gymId });
  const { query, pagination } = paginate(
    Inventory.find(filter).sort({ createdAt: -1 }),
    req.query
  );
  const items = await query;

  // Stats
  const [inStock, lowStock, outOfStock] = await Promise.all([
    Inventory.countDocuments({ gym: gymId, status: "In Stock" }),
    Inventory.countDocuments({ gym: gymId, status: "Low Stock" }),
    Inventory.countDocuments({ gym: gymId, status: "Out of Stock" }),
  ]);

  res.json({
    success: true,
    data: items,
    stats: { total, inStock, lowStock, outOfStock },
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/inventory/:id ────────────────────────────────────────
exports.getItem = asyncHandler(async (req, res, next) => {
  const item = await Inventory.findById(req.params.id);
  if (!item) return next(new AppError("Item not found.", 404));
  res.json({ success: true, data: item });
});

// ── @POST /api/inventory ───────────────────────────────────────────
exports.createItem = asyncHandler(async (req, res, next) => {
  const gymId = req.user.role === "gym-owner"
    ? await resolveGymId(req.user)
    : req.body.gym;

  if (!gymId) return next(new AppError("Gym ID is required.", 400));

  const item = await Inventory.create({
    ...req.body,
    gym:     gymId,
    addedBy: req.user._id,
  });

  // Always notify on item added
  await createNotification({
    gym:      gymId,
    sender:   req.user._id,
    title:    "📦 New Item Added to Inventory",
    message:  `${item.name} (${item.category}) — ${item.stock} units at ₹${item.price}.`,
    type:     "alert",
    audience: "specific-gym",
  }).catch(() => {});

  // Extra alert if low/out of stock on creation
  if (item.status !== "In Stock") {
    await createNotification({
      gym:      gymId,
      sender:   req.user._id,
      title:    `⚠️ ${item.status}: ${item.name}`,
      message:  `${item.name} was added with only ${item.stock} units (min: ${item.minStock}).`,
      type:     "alert",
      audience: "specific-gym",
    }).catch(() => {});
  }

  res.status(201).json({ success: true, data: item });
});

// ── @PUT /api/inventory/:id ────────────────────────────────────────
exports.updateItem = asyncHandler(async (req, res, next) => {
  const item = await Inventory.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  if (!item) return next(new AppError("Item not found.", 404));

  // Always notify on update
  await createNotification({
    gym:      item.gym,
    sender:   req.user._id,
    title:    "✏️ Inventory Item Updated",
    message:  `${item.name} updated — Stock: ${item.stock}, Price: ₹${item.price}.`,
    type:     "alert",
    audience: "specific-gym",
  }).catch(() => {});

  // Extra alert if stock is critical
  if (item.status === "Out of Stock") {
    await createNotification({
      gym:      item.gym,
      sender:   req.user._id,
      title:    `🚨 Out of Stock: ${item.name}`,
      message:  `${item.name} is now out of stock. Please reorder.`,
      type:     "alert",
      audience: "specific-gym",
    }).catch(() => {});
  } else if (item.status === "Low Stock") {
    await createNotification({
      gym:      item.gym,
      sender:   req.user._id,
      title:    `⚠️ Low Stock: ${item.name}`,
      message:  `${item.name} has only ${item.stock} units left (min: ${item.minStock}).`,
      type:     "alert",
      audience: "specific-gym",
    }).catch(() => {});
  }

  res.json({ success: true, data: item });
});

// ── @PATCH /api/inventory/:id/stock ───────────────────────────────
// Quick stock update only
exports.updateStock = asyncHandler(async (req, res, next) => {
  const { stock } = req.body;
  if (stock === undefined || stock < 0) {
    return next(new AppError("Valid stock value required.", 400));
  }

  const item = await Inventory.findByIdAndUpdate(
    req.params.id,
    { stock: Number(stock) },
    { new: true }
  );
  if (!item) return next(new AppError("Item not found.", 404));

  // Notify on critical stock changes
  if (item.status === "Out of Stock") {
    await createNotification({
      gym:      item.gym,
      title:    `🚨 Out of Stock: ${item.name}`,
      message:  `${item.name} is now out of stock.`,
      type:     "alert",
      audience: "specific-gym",
    }).catch(() => {});
  } else if (item.status === "Low Stock") {
    await createNotification({
      gym:      item.gym,
      title:    `⚠️ Low Stock: ${item.name}`,
      message:  `${item.name} has only ${item.stock} units left.`,
      type:     "alert",
      audience: "specific-gym",
    }).catch(() => {});
  }

  res.json({ success: true, data: item });
});

// ── @DELETE /api/inventory/:id ─────────────────────────────────────
exports.deleteItem = asyncHandler(async (req, res, next) => {
  const item = await Inventory.findByIdAndDelete(req.params.id);
  if (!item) return next(new AppError("Item not found.", 404));

  await createNotification({
    gym:      item.gym,
    sender:   req.user._id,
    title:    "🗑️ Inventory Item Removed",
    message:  `${item.name} (${item.category}) has been removed from inventory.`,
    type:     "alert",
    audience: "specific-gym",
  }).catch(() => {});

  res.json({ success: true, message: "Item deleted." });
});
