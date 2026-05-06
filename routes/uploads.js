const express = require("express");
const router = express.Router();
const { uploadFile, deleteFile } = require("../controllers/uploadController");
const { protect } = require("../middleware/auth");
const { uploadSingle } = require("../middleware/upload");

// Any logged-in user can upload (gym-owner, super-admin, member)
// Folder is passed as query param: ?folder=trainers or ?folder=classes
router.use(protect);

router.post("/",   uploadSingle("file"), uploadFile);
router.delete("/", deleteFile);

module.exports = router;
