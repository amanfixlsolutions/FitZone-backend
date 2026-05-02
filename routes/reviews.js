const express = require("express");
const router = express.Router();
const { getReviews, createReview, approveReview, flagReview, rejectReview, deleteReview } = require("../controllers/reviewController");
const { protect, superAdminOnly } = require("../middleware/auth");

router.get("/",              protect, superAdminOnly, getReviews);
router.post("/",             createReview);
router.post("/:id/approve",  protect, superAdminOnly, approveReview);
router.post("/:id/flag",     protect, superAdminOnly, flagReview);
router.post("/:id/reject",   protect, superAdminOnly, rejectReview);
router.delete("/:id",        protect, superAdminOnly, deleteReview);

module.exports = router;
