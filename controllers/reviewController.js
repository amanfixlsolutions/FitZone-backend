const Review = require("../models/Review");
const Gym = require("../models/Gym");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");

exports.getReviews = asyncHandler(async (req, res) => {
  const { status, gymId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (gymId)  filter.gym = gymId;

  const total = await Review.countDocuments(filter);
  const { query, pagination } = paginate(
    Review.find(filter).populate("gym", "name city").sort({ createdAt: -1 }),
    req.query
  );

  const reviews = await query;
  res.json({ success: true, data: reviews, pagination: buildPaginationMeta(total, pagination.page, pagination.limit) });
});

exports.createReview = asyncHandler(async (req, res) => {
  const review = await Review.create(req.body);
  res.status(201).json({ success: true, data: review });
});

exports.approveReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { status: "approved", moderatedBy: req.user._id, moderatedAt: new Date() },
    { new: true }
  );
  if (!review) return next(new AppError("Review not found.", 404));

  // Update gym rating
  const gymReviews = await Review.find({ gym: review.gym, status: "approved" });
  const avgRating = gymReviews.reduce((sum, r) => sum + r.rating, 0) / gymReviews.length;
  await Gym.findByIdAndUpdate(review.gym, { rating: avgRating.toFixed(1), totalRatings: gymReviews.length });

  res.json({ success: true, data: review });
});

exports.flagReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { status: "flagged", flagReason: req.body.reason, moderatedBy: req.user._id, moderatedAt: new Date() },
    { new: true }
  );
  if (!review) return next(new AppError("Review not found.", 404));
  res.json({ success: true, data: review });
});

exports.rejectReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { status: "rejected", flagReason: req.body.reason || "", moderatedBy: req.user._id, moderatedAt: new Date() },
    { new: true }
  );
  if (!review) return next(new AppError("Review not found.", 404));
  res.json({ success: true, data: review });
});

exports.deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) return next(new AppError("Review not found.", 404));
  res.json({ success: true, message: "Review deleted." });
});
