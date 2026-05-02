const express = require("express");
const router = express.Router();
const {
  createMeeting, getMeetings, getMeeting, deleteMeeting, registerForMeeting,
} = require("../controllers/zoomController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/",                    getMeetings);
router.get("/:id",                 getMeeting);
router.post("/",                   createMeeting);
router.delete("/:id",              deleteMeeting);
router.post("/:id/register",       registerForMeeting);

module.exports = router;
