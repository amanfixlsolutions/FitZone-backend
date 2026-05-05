const multer = require("multer");
const path = require("path");
const AppError = require("../utils/AppError");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|pdf/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) return cb(null, true);
  cb(new AppError("Only images (jpeg, jpg, png, gif, webp) and PDFs are allowed.", 400));
};

const upload = multer({
  storage,
  fileFilter,
  // No file size limit — accept any size
});

exports.uploadSingle = (field) => upload.single(field);
exports.uploadMultiple = (field, max = 5) => upload.array(field, max);
exports.uploadFields = (fields) => upload.fields(fields);
