const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
  gym:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  name:        { type: String, required: true, trim: true },
  category:    {
    type: String,
    enum: ["Supplements", "Accessories", "Equipment", "Apparel", "Beverages", "Other"],
    default: "Other",
  },
  price:       { type: Number, required: true, min: 0 },
  stock:       { type: Number, required: true, min: 0, default: 0 },
  minStock:    { type: Number, default: 5 },
  description: { type: String, default: "" }, 

  // Auto-computed status
  status: {
    type: String,
    enum: ["In Stock", "Low Stock", "Out of Stock"],
    default: "In Stock",
  },
}, { timestamps: true });

// Auto-update status before save
inventorySchema.pre("save", async function () {
  if (this.stock === 0)                this.status = "Out of Stock";
  else if (this.stock <= this.minStock) this.status = "Low Stock";
  else                                 this.status = "In Stock";
});

// Also update status on findOneAndUpdate
inventorySchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate();
  const stock    = update?.stock    ?? update?.$set?.stock;
  const minStock = update?.minStock ?? update?.$set?.minStock;
  if (stock !== undefined) {
    const min = minStock !== undefined ? Number(minStock) : 5;
    let status;
    if (Number(stock) === 0)             status = "Out of Stock";
    else if (Number(stock) <= min)       status = "Low Stock";
    else                                 status = "In Stock";
    this.set({ status });
  }
});

inventorySchema.index({ gym: 1, category: 1 });
inventorySchema.index({ gym: 1, status: 1 });

module.exports = mongoose.model("Inventory", inventorySchema);
