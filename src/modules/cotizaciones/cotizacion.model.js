const mongoose = require("mongoose");

const { Schema } = mongoose;

// Estados de la cotización en el flujo de gestión
const COTIZACION_ESTADOS = ["PENDIENTE", "EN_GESTION", "RESPONDIDA", "VENCIDA"];

const cotizacionSchema = new Schema(
  {
    // Identificadores del correo en el proveedor (por ejemplo Gmail)
    emailMessageId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    emailThreadId: {
      type: String,
      required: false,
      index: true,
    },

    // Datos básicos del correo de la cotización
    asunto: {
      type: String,
      required: true,
      trim: true,
    },
    remitenteNombre: {
      type: String,
      required: false,
      trim: true,
    },
    remitenteEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    para: {
      type: [String],
      default: [],
    },
    cc: {
      type: [String],
      default: [],
    },
    preview: {
      type: String,
      required: false,
      trim: true,
    },

    // Tiempos clave para medir la gestión
    recibidaEn: {
      type: Date,
      required: true,
      index: true,
    },
    primeraRespuestaEn: {
      type: Date,
      default: null,
    },

    // Estado actual de la cotización
    estado: {
      type: String,
      required: true,
      enum: COTIZACION_ESTADOS,
      default: "PENDIENTE",
      index: true,
    },

    // Usuario asignado a gestionar esta cotización
    asignadaA: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
      index: true,
    },

    // Tiempo de gestión en minutos para reportes
    tiempoGestionMin: {
      type: Number,
      default: null,
    },

    // Campo para observaciones internas del equipo
    notasInternas: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índice combinado útil para ordenar por antigüedad y estado
cotizacionSchema.index({ estado: 1, recibidaEn: 1 });

const Cotizacion = mongoose.model("Cotizacion", cotizacionSchema);

module.exports = {
  Cotizacion,
  COTIZACION_ESTADOS,
};
