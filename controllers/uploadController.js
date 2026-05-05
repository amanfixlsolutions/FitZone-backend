const path = require("path");
const fs   = require("fs");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// ── Try Cloudinary, fall back to local storage ─────────────────────
const uploadToStorage = async (buffer, mimetype, folder = "fitzone") => {
  // Try Cloudinary if configured
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_CLOUD_NAME !== "your_cloud_name" &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_KEY !== "your_api_key"
  ) {
    const { uploadImage } = require("../services/cloudinaryService");
    return await uploadImage(buffer, folder);
  }

  // Fallback: save to local /public/uploads folder
  const uploadsDir = path.join(__dirname, "../public/uploads", folder);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext      = mimetype.split("/")[1] || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filepath = path.join(uploadsDir, filename);

  fs.writeFileSync(filepath, buffer);

  // Return full absolute URL so frontend can display it directly
  const baseUrl = process.env.CLIENT_BACKEND_URL ||
                  `https://fitzone-backend-vis3.onrender.com`;
  const publicUrl = `${baseUrl}/uploads/${folder}/${filename}`;
  return { url: publicUrl, publicId: `${folder}/${filename}` };
};

// ── @POST /api/uploads ─────────────────────────────────────────────
exports.uploadFile = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError("No file uploaded.", 400));

  const folder = req.query.folder || "fitzone";
  const result = await uploadToStorage(req.file.buffer, req.file.mimetype, folder);

  res.json({ success: true, data: result });
});

// ── @DELETE /api/uploads ───────────────────────────────────────────
exports.deleteFile = asyncHandler(async (req, res, next) => {
  const { publicId } = req.body;
  if (!publicId) return next(new AppError("Public ID is required.", 400));

  // Try Cloudinary
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_CLOUD_NAME !== "your_cloud_name"
  ) {
    const { deleteImage } = require("../services/cloudinaryService");
    await deleteImage(publicId);
  } else {
    // Delete local file
    const filepath = path.join(__dirname, "../public", publicId);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }

  res.json({ success: true, message: "File deleted." });
});
