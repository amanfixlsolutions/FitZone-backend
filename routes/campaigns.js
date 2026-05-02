const express = require("express");
const router  = express.Router();
const {
  getCampaigns, createCampaign, updateCampaign,
  deleteCampaign, broadcast,
} = require("../controllers/campaignController");
const { protect, gymOwnerOnly } = require("../middleware/auth");

router.use(protect, gymOwnerOnly);

router.get("/",           getCampaigns);
router.post("/",          createCampaign);
router.post("/broadcast", broadcast);
router.put("/:id",        updateCampaign);
router.delete("/:id",     deleteCampaign);

module.exports = router;
