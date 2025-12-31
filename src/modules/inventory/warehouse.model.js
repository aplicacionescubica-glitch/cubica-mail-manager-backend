const mongoose = require("mongoose");

/* Esquema de bodegas para separar stock y movimientos */
const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
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

/* Índices para búsquedas y unicidad */
warehouseSchema.index({ code: 1 }, { unique: true });
warehouseSchema.index({ name: 1 });
warehouseSchema.index({ active: 1 });

module.exports = mongoose.model("Warehouse", warehouseSchema);
