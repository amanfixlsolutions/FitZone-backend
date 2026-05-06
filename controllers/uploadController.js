const path = require("path");
const fs   = require("fs");
const { asyncHandler } = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// ── Cloudinary configured? ─────────────────────────────────────────
const isCloudinaryConfigured = () =>
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== "your_cloud_name" &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY !== "your_api_key";

// ── Upload to storage (Cloudinary or local) ────────────────────────
const uploadToStorage = async (buffer, mimetype, folder = "fitzone") => {
  if (isCloudinaryConfigured()) {
    const { uploadImage } = require("../services/cloudinaryService");
    return await uploadImage(buffer, folder);
  }

  // Local fallback — save to /public/uploads/<folder>/
  const uploadsDir = path.join(__dirname, "../public/uploads", folder);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext      = mimetype.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filepath = path.join(uploadsDir, filename);

  fs.writeFileSync(filepath, buffer);

  // Return full absolute URL so frontend can display it directly
  // Use BACKEND_URL env var if set, otherwise use the Render URL
  const baseUrl = process.env.BACKEND_URL ||
                  process.env.CLIENT_BACKEND_URL ||
                  "https://fitzone-backend-vis3.onrender.com";
  const publicUrl = `${baseUrl}/uploads/${folder}/${filename}`;
  return { url: publicUrl, publicId: `${folder}/${filename}` };
};

// ── Delete from storage (Cloudinary or local) ─────────────────────
const deleteFromStorage = async (publicId) => {
  if (!publicId) return;

  if (isCloudinaryConfigured()) {
    try {
      const { deleteImage } = require("../services/cloudinaryService");
      await deleteImage(publicId);
    } catch { /* silent — file may already be gone */ }
    return;
  }

  // Local delete — publicId is like "trainers/filename.jpg"
  const filepath = path.join(__dirname, "../public/uploads", publicId);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
};

// ── Extract publicId from a URL ────────────────────────────────────
// Handles both:
//   https://fitzone-backend-vis3.onrender.com/uploads/trainers/abc.jpg → trainers/abc.jpg
//   https://res.cloudinary.com/.../fitzone/trainers/abc → fitzone/trainers/abc
const extractPublicId = (url) => {
  if (!url) return null;
  if (url.includes("cloudinary.com")) {
    // Cloudinary URL — extract public_id (everything after /upload/ without extension)
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
    return match ? match[1] : null;
  }
  // Local URL — extract path after /uploads/
  const match = url.match(/\/uploads\/(.+)$/);
  return match ? match[1] : null;
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
  const { publicId, url } = req.body;

  // Accept either publicId directly or extract from URL
  const id = publicId || extractPublicId(url);
  if (!id) return next(new AppError("publicId or url is required.", 400));

  await deleteFromStorage(id);
  res.json({ success: true, message: "File deleted." });
});

// ── Export helpers for use in other controllers ────────────────────
exports.deleteFromStorage = deleteFromStorage;
exports.extractPublicId   = extractPublicId;
