const mongoose = require("mongoose");

/* Esquema de ítems de inventario */
const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    category: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    unit: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32,
    },
    min_stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* Índices para consultas comunes */
inventoryItemSchema.index({ name: 1 });
inventoryItemSchema.index({ category: 1 });
inventoryItemSchema.index({ active: 1 });

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
