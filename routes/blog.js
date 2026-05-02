const express = require("express");
const router = express.Router();
const { getBlogs, getBlog, createBlog, updateBlog, deleteBlog } = require("../controllers/blogController");
const { protect, superAdminOnly } = require("../middleware/auth");

router.get("/",       getBlogs);
router.get("/:id",    getBlog);
router.post("/",      protect, superAdminOnly, createBlog);
router.put("/:id",    protect, superAdminOnly, updateBlog);
router.delete("/:id", protect, superAdminOnly, deleteBlog);

module.exports = router;
