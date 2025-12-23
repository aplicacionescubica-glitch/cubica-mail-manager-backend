const mongoose = require("mongoose");

/* Modelo de historial de correos procesados */
const emailLogSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "GMAIL", index: true },
    messageId: { type: String, required: true, unique: true, index: true },
    threadId: { type: String, default: null, index: true },

    receivedAt: { type: Date, default: null, index: true },

    fromName: { type: String, default: "" },
    fromEmail: { type: String, default: "", index: true },

    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },

    subject: { type: String, default: "" },
    snippet: { type: String, default: "" },

    labels: { type: [String], default: [] },

    status: { type: String, default: "PROCESADO", index: true },

    cotizacionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cotizacion",
      default: null,
      index: true,
    },

    error: { type: String, default: null },

    rawMeta: { type: Object, default: {} },
  },
  {
    timestamps: true,
  }
);

/* Índice de búsqueda rápida por texto */
emailLogSchema.index({
  subject: "text",
  snippet: "text",
  fromEmail: "text",
  fromName: "text",
});

/* Exporta el modelo reutilizando instancia si existe */
module.exports = mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);
