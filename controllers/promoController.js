const Promo = require("../models/Promo");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

exports.getPromos = asyncHandler(async (req, res) => {
  const filter = req.user.role === "gym-owner" ? { $or: [{ gym: req.user.gym }, { gym: null }] } : {};
  const promos = await Promo.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: promos });
});

exports.createPromo = asyncHandler(async (req, res) => {
  const promo = await Promo.create({ ...req.body, addedBy: req.user._id });
  res.status(201).json({ success: true, data: promo });
});

exports.updatePromo = asyncHandler(async (req, res, next) => {
  const promo = await Promo.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!promo) return next(new AppError("Promo not found.", 404));
  res.json({ success: true, data: promo });
});

exports.deletePromo = asyncHandler(async (req, res, next) => {
  const promo = await Promo.findByIdAndDelete(req.params.id);
  if (!promo) return next(new AppError("Promo not found.", 404));
  res.json({ success: true, message: "Promo deleted." });
});

exports.validatePromo = asyncHandler(async (req, res, next) => {
  const { code, amount } = req.body;
  const promo = await Promo.findOne({ code: code.toUpperCase(), active: true });

  if (!promo) return next(new AppError("Invalid promo code.", 400));
  if (new Date() > promo.validUntil) return next(new AppError("Promo code has expired.", 400));
  if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return next(new AppError("Promo code usage limit reached.", 400));
  if (amount < promo.minAmount) return next(new AppError(`Minimum order amount is ₹${promo.minAmount}.`, 400));

  let discount = promo.discountType === "percentage"
    ? (amount * promo.discountValue) / 100
    : promo.discountValue;

  if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);

  res.json({ success: true, data: { promo, discount, finalAmount: amount - discount } });
});
