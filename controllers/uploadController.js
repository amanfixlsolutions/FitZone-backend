const path = require("path");
const fs   = require("fs");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const cloudinaryService = require("../services/cloudinaryService");

// ── Upload to Cloudinary (required for production) ─────────────────
const uploadToStorage = async (buffer, mimetype, folder = "fitzone") => {
  if (cloudinaryService.isConfigured()) {
    return await cloudinaryService.uploadImage(buffer, folder);
  }

  // ── Local fallback (dev only — files lost on Render redeploy) ──
  const uploadsDir = path.join(__dirname, "../public/uploads", folder);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext      = mimetype.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filepath = path.join(uploadsDir, filename);

  fs.writeFileSync(filepath, buffer);

  const baseUrl  = process.env.CLIENT_BACKEND_URL || "https://fitzone-backend-vis3.onrender.com";
  const publicUrl = `${baseUrl}/uploads/${folder}/${filename}`;
  return { url: publicUrl, publicId: `${folder}/${filename}` };
};

// ── @POST /api/uploads ─────────────────────────────────────────────
exports.uploadFile = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError("No file uploaded.", 400));

  if (!cloudinaryService.isConfigured()) {
    return next(new AppError(
      "Image storage not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in Render environment variables.",
      503
    ));
  }

  const folder = req.query.folder || "fitzone";
  const result = await uploadToStorage(req.file.buffer, req.file.mimetype, folder);

  res.json({ success: true, data: result });
});

// ── @DELETE /api/uploads ───────────────────────────────────────────
exports.deleteFile = asyncHandler(async (req, res, next) => {
  const { publicId } = req.body;
  if (!publicId) return next(new AppError("Public ID is required.", 400));

  if (cloudinaryService.isConfigured()) {
    await cloudinaryService.deleteImage(publicId).catch(() => {});
  } else {
    const filepath = path.join(__dirname, "../public", publicId);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }

  res.json({ success: true, message: "File deleted." });
});
