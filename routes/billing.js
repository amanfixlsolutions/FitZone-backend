const express = require("express");
const router = express.Router();
const { protect, gymOwnerOnly } = require("../middleware/auth");
const {
  getSubscriptionStatus,
  createSubscriptionOrder,
  verifySubscription,
  cancelSubscription,
  upgradeSubscription,
} = require("../controllers/billingController");

router.use(protect, gymOwnerOnly);

router.get("/status",        getSubscriptionStatus);
router.post("/create-order", createSubscriptionOrder);
router.post("/verify",       verifySubscription);
router.post("/cancel",       cancelSubscription);
router.post("/upgrade",      upgradeSubscription);

module.exports = router;
