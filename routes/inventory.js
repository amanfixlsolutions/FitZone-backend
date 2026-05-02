const express = require("express");
const router = express.Router();
const {
  getInventory, getItem, createItem,
  updateItem, updateStock, deleteItem,
} = require("../controllers/inventoryController");
const { protect, adminOrSuperAdmin } = require("../middleware/auth");

router.use(protect, adminOrSuperAdmin);

router.get("/",              getInventory);
router.get("/:id",           getItem);
router.post("/",             createItem);
router.put("/:id",           updateItem);
router.patch("/:id/stock",   updateStock);
router.delete("/:id",        deleteItem);

module.exports = router;
