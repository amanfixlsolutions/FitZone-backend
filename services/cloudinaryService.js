const cloudinary = require("cloudinary").v2;

// ── Lazy config — reads env vars at call time ──────────────────────
const getCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
};

exports.uploadImage = async (buffer, folder = "fitzone") => {
  const cl = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cl.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        quality:       "auto",
        fetch_format:  "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
};

exports.deleteImage = async (publicId) => {
  const cl = getCloudinary();
  return cl.uploader.destroy(publicId);
};

exports.isConfigured = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_CLOUD_NAME !== "your_cloud_name" &&
    process.env.CLOUDINARY_API_KEY    &&
    process.env.CLOUDINARY_API_KEY    !== "your_api_key"    &&
    process.env.CLOUDINARY_API_SECRET &&
    process.env.CLOUDINARY_API_SECRET !== "your_api_secret"
  );
};
