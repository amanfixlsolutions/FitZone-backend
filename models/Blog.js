const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  authorName:{ type: String, required: true },

  title:    { type: String, required: true, trim: true },
  slug:     { type: String, unique: true, lowercase: true },
  content:  { type: String, required: true },
  excerpt:  { type: String, default: "" },
  image:    { type: String, default: "" },

  category: {
    type: String,
    enum: ["Fitness", "Nutrition", "Wellness", "News", "Tips", "Other"],
    default: "Fitness",
  },

  tags:   [{ type: String }],
  status: { type: String, enum: ["draft", "published"], default: "draft" },

  seoTitle:       { type: String, default: "" },
  seoDescription: { type: String, default: "" },

  views:     { type: Number, default: 0 },
  publishedAt:{ type: Date, default: null },
}, { timestamps: true });

blogSchema.index({ status: 1, publishedAt: -1 });
// slug already has unique:true on field — no separate index needed

module.exports = mongoose.model("Blog", blogSchema);
