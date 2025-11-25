const mongoose = require("mongoose");
const { Cotizacion, COTIZACION_ESTADOS } = require("./cotizacion.model");
const { sendCotizacionReply } = require("../mail/mail.service");

// Calcula minutos de diferencia entre dos fechas
function diffMinutes(from, to) {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 60000);
}

// Crea una cotización a partir de los datos de un correo
async function createCotizacionFromEmail(payload) {
  const {
    emailMessageId,
    emailThreadId,
    asunto,
    remitenteNombre,
    remitenteEmail,
    para,
    cc,
    preview,
    recibidaEn,
  } = payload;

  if (!emailMessageId || !asunto || !remitenteEmail || !recibidaEn) {
    const error = new Error("Faltan datos obligatorios para crear la cotización");
    error.status = 400;
    error.code = "MISSING_FIELDS";
    throw error;
  }

  const normalizedMessageId = String(emailMessageId).trim();
  const normalizedThreadId = emailThreadId ? String(emailThreadId).trim() : null;
  const normalizedRemitenteEmail = String(remitenteEmail).toLowerCase().trim();

  const existing = await Cotizacion.findOne({ emailMessageId: normalizedMessageId });
  if (existing) {
    return {
      created: false,
      cotizacion: existing,
    };
  }

  const cotizacion = new Cotizacion({
    emailMessageId: normalizedMessageId,
    emailThreadId: normalizedThreadId,
    asunto: String(asunto).trim(),
    remitenteNombre: remitenteNombre ? String(remitenteNombre).trim() : "",
    remitenteEmail: normalizedRemitenteEmail,
    para: Array.isArray(para) ? para : [],
    cc: Array.isArray(cc) ? cc : [],
    preview: preview ? String(preview).trim() : "",
    recibidaEn: new Date(recibidaEn),
    estado: "PENDIENTE",
    asignadaA: null,
    primeraRespuestaEn: null,
    tiempoGestionMin: null,
    notasInternas: "",
  });

  await cotizacion.save();

  return {
    created: true,
    cotizacion,
  };
}

// Lista cotizaciones con filtros y orden por antigüedad
async function listCotizaciones({ estado, asignadaA, page = 1, limit = 20 } = {}) {
  const query = {};

  if (estado) {
    if (!COTIZACION_ESTADOS.includes(estado)) {
      const error = new Error("Estado de cotización inválido");
      error.status = 400;
      error.code = "INVALID_STATUS";
      throw error;
    }
    query.estado = estado;
  }

  if (asignadaA) {
    query.asignadaA = asignadaA;
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    Cotizacion.find(query)
      .sort({ recibidaEn: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate("asignadaA", "nombre email rol"),
    Cotizacion.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: pageNum,
    limit: limitNum,
  };
}

// Marca una cotización como en gestión y la asigna a un usuario
async function marcarCotizacionEnGestion({ cotizacionId, usuarioId }) {
  if (!mongoose.isValidObjectId(cotizacionId)) {
    const error = new Error("ID de cotización inválido");
    error.status = 400;
    error.code = "INVALID_QUOTE_ID";
    throw error;
  }

  if (!mongoose.isValidObjectId(usuarioId)) {
    const error = new Error("ID de usuario inválido");
    error.status = 400;
    error.code = "INVALID_USER_ID";
    throw error;
  }

  const cotizacion = await Cotizacion.findById(cotizacionId);

  if (!cotizacion) {
    const error = new Error("Cotización no encontrada");
    error.status = 404;
    error.code = "QUOTE_NOT_FOUND";
    throw error;
  }

  if (cotizacion.estado === "RESPONDIDA" || cotizacion.estado === "VENCIDA") {
    const error = new Error("No se puede marcar en gestión una cotización cerrada");
    error.status = 400;
    error.code = "QUOTE_CLOSED";
    throw error;
  }

  cotizacion.estado = "EN_GESTION";
  cotizacion.asignadaA = usuarioId;

  await cotizacion.save();

  return cotizacion;
}

// Marca una cotización como respondida y calcula tiempo de gestión
async function marcarCotizacionRespondida({ cotizacionId, usuarioId, respondedAt }) {
  if (!mongoose.isValidObjectId(cotizacionId)) {
    const error = new Error("ID de cotización inválido");
    error.status = 400;
    error.code = "INVALID_QUOTE_ID";
    throw error;
  }

  const cotizacion = await Cotizacion.findById(cotizacionId);

  if (!cotizacion) {
    const error = new Error("Cotización no encontrada");
    error.status = 404;
    error.code = "QUOTE_NOT_FOUND";
    throw error;
  }

  const respuestaEn = respondedAt ? new Date(respondedAt) : new Date();

  if (!cotizacion.primeraRespuestaEn) {
    cotizacion.primeraRespuestaEn = respuestaEn;
    if (cotizacion.recibidaEn) {
      cotizacion.tiempoGestionMin = diffMinutes(cotizacion.recibidaEn, respuestaEn);
    }
  }

  cotizacion.estado = "RESPONDIDA";

  if (usuarioId && mongoose.isValidObjectId(usuarioId)) {
    cotizacion.asignadaA = usuarioId;
  }

  await cotizacion.save();

  return cotizacion;
}

// Marca una cotización como vencida
async function marcarCotizacionVencida({ cotizacionId }) {
  if (!mongoose.isValidObjectId(cotizacionId)) {
    const error = new Error("ID de cotización inválido");
    error.status = 400;
    error.code = "INVALID_QUOTE_ID";
    throw error;
  }

  const cotizacion = await Cotizacion.findById(cotizacionId);

  if (!cotizacion) {
    const error = new Error("Cotización no encontrada");
    error.status = 404;
    error.code = "QUOTE_NOT_FOUND";
    throw error;
  }

  if (cotizacion.estado === "RESPONDIDA") {
    const error = new Error("No se puede marcar como vencida una cotización respondida");
    error.status = 400;
    error.code = "QUOTE_ALREADY_RESPONDED";
    throw error;
  }

  cotizacion.estado = "VENCIDA";

  await cotizacion.save();

  return cotizacion;
}

// Busca cotizaciones pendientes o en gestión que ya superaron el umbral de minutos
async function findCotizacionesPendientesParaAlerta({ minutosUmbral }) {
  if (!minutosUmbral || minutosUmbral <= 0) {
    const error = new Error("El umbral de minutos debe ser mayor que cero");
    error.status = 400;
    error.code = "INVALID_THRESHOLD";
    throw error;
  }

  const ahora = new Date();
  const limite = new Date(ahora.getTime() - minutosUmbral * 60000);

  const query = {
    estado: { $in: ["PENDIENTE", "EN_GESTION"] },
    recibidaEn: { $lte: limite },
    primeraRespuestaEn: null,
  };

  const items = await Cotizacion.find(query)
    .sort({ recibidaEn: 1 })
    .populate("asignadaA", "nombre email rol");

  return items;
}

// Envía una respuesta de cotización y actualiza su estado
async function responderCotizacion({
  cotizacionId,
  usuarioId,
  mensajeHtml,
  mensajeTexto,
  asunto,
  cc,
}) {
  if (!mongoose.isValidObjectId(cotizacionId)) {
    const error = new Error("ID de cotización inválido");
    error.status = 400;
    error.code = "INVALID_QUOTE_ID";
    throw error;
  }

  const cotizacion = await Cotizacion.findById(cotizacionId);

  if (!cotizacion) {
    const error = new Error("Cotización no encontrada");
    error.status = 404;
    error.code = "QUOTE_NOT_FOUND";
    throw error;
  }

  const to = cotizacion.remitenteEmail;
  if (!to) {
    const error = new Error("La cotización no tiene remitenteEmail definido");
    error.status = 400;
    error.code = "QUOTE_MISSING_EMAIL";
    throw error;
  }

  const subject =
    asunto && String(asunto).trim().length > 0
      ? String(asunto).trim()
      : cotizacion.asunto
      ? `Re: ${cotizacion.asunto}`
      : "Respuesta a cotización";

  let plainText = "";
  if (mensajeTexto && String(mensajeTexto).trim().length > 0) {
    plainText = String(mensajeTexto).trim();
  } else if (mensajeHtml && String(mensajeHtml).trim().length > 0) {
    plainText = String(mensajeHtml)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const html =
    mensajeHtml && String(mensajeHtml).trim().length > 0
      ? String(mensajeHtml)
      : undefined;

  const inReplyTo = cotizacion.emailMessageId || undefined;

  const info = await sendCotizacionReply({
    to,
    cc: Array.isArray(cc) ? cc : undefined,
    subject,
    text: plainText || undefined,
    html,
    inReplyTo,
  });

  const respondedAt = new Date();
  const cotizacionActualizada = await marcarCotizacionRespondida({
    cotizacionId,
    usuarioId,
    respondedAt,
  });

  return {
    cotizacion: cotizacionActualizada,
    emailInfo: {
      messageId: info && info.messageId ? info.messageId : null,
      accepted: info && info.accepted ? info.accepted : undefined,
      rejected: info && info.rejected ? info.rejected : undefined,
      response: info && info.response ? info.response : undefined,
    },
  };
}

module.exports = {
  createCotizacionFromEmail,
  listCotizaciones,
  marcarCotizacionEnGestion,
  marcarCotizacionRespondida,
  marcarCotizacionVencida,
  findCotizacionesPendientesParaAlerta,
  responderCotizacion,
};
