const mongoose = require("mongoose");

/* Esquema de movimientos de inventario */
const stockMoveSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
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
      maxlength: 500,
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

/* Índices para consultas por item y fecha */
stockMoveSchema.index({ itemId: 1, createdAt: -1 });
stockMoveSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("StockMove", stockMoveSchema);
