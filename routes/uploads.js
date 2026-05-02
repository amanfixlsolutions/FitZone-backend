const express = require("express");
const router = express.Router();
const { uploadFile, deleteFile } = require("../controllers/uploadController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");
const { uploadSingle } = require("../middleware/upload");

router.use(protect, adminOrSuperAdmin);

router.post("/",        uploadSingle("file"), uploadFile);
router.delete("/",      deleteFile);

module.exports = router;
