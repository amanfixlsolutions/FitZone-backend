const cloudinary = require("cloudinary").v2;

// ── Lazy config — called on first use so env vars are always loaded ─
let _configured = false;
const configure = () => {
  if (_configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  _configured = true;
};

exports.uploadImage = async (buffer, folder = "fitzone") => {
  configure();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        quality: "auto",
        fetch_format: "auto",
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
  configure();
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch { /* silent */ }
};
