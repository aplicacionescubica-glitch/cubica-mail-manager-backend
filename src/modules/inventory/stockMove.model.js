const mongoose = require("mongoose");

/* Esquema de movimientos de inventario con soporte por bodega */
const stockMoveSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["IN", "OUT", "ADJUST"],
      index: true,
    },
    qty: {
      type: Number,
      required: true,
    },
    to: {
      type: Number,
      default: null,
    },
    note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    transferId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* Índices para consultas por item, bodega y fecha */
stockMoveSchema.index({ itemId: 1, warehouseId: 1, createdAt: -1 });
stockMoveSchema.index({ warehouseId: 1, createdAt: -1 });
stockMoveSchema.index({ type: 1, warehouseId: 1, createdAt: -1 });
stockMoveSchema.index({ transferId: 1, createdAt: -1 });

module.exports = mongoose.model("StockMove", stockMoveSchema);
