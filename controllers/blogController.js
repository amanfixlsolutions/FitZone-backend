const Blog = require("../models/Blog");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

exports.getBlogs = asyncHandler(async (req, res) => {
  const { status, category, search } = req.query;
  const filter = {};
  if (status)   filter.status = status;
  if (category) filter.category = category;
  if (search)   filter.$or = [{ title: new RegExp(search, "i") }, { content: new RegExp(search, "i") }];

  const total = await Blog.countDocuments(filter);
  const { query, pagination } = paginate(
    Blog.find(filter).populate("author", "name").sort({ createdAt: -1 }),
    req.query
  );

  const blogs = await query;
  res.json({ success: true, data: blogs, pagination: buildPaginationMeta(total, pagination.page, pagination.limit) });
});

exports.getBlog = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Build query — only use _id match if it looks like a valid ObjectId
  // Otherwise just search by slug to avoid Mongoose CastError
  const mongoose = require("mongoose");
  const isObjectId = mongoose.Types.ObjectId.isValid(id) && id.length === 24;

  const query = isObjectId
    ? { $or: [{ _id: id }, { slug: id }] }
    : { slug: id };

  const blog = await Blog.findOne(query).populate("author", "name");
  if (!blog) return next(new AppError("Blog post not found.", 404));

  blog.views += 1;
  await blog.save();
  res.json({ success: true, data: blog });
});

exports.createBlog = asyncHandler(async (req, res) => {
  const slug = slugify(req.body.title) + "-" + Date.now();
  const blog = await Blog.create({
    ...req.body,
    slug,
    author: req.user._id,
    authorName: req.user.name,
    publishedAt: req.body.status === "published" ? new Date() : null,
  });
  res.status(201).json({ success: true, data: blog });
});

exports.updateBlog = asyncHandler(async (req, res, next) => {
  if (req.body.status === "published") req.body.publishedAt = new Date();
  const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!blog) return next(new AppError("Blog post not found.", 404));
  res.json({ success: true, data: blog });
});

exports.deleteBlog = asyncHandler(async (req, res, next) => {
  const blog = await Blog.findByIdAndDelete(req.params.id);
  if (!blog) return next(new AppError("Blog post not found.", 404));
  res.json({ success: true, message: "Blog post deleted." });
});
