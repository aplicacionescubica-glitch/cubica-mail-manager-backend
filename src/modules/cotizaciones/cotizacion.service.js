const { Cotizacion, COTIZACION_ESTADOS } = require("./cotizacion.model");

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
    para: Array.isArray(para) ? para : para ? [String(para)] : [],
    cc: Array.isArray(cc) ? cc : cc ? [String(cc)] : [],
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

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * pageSize;

  const [items, total] = await Promise.all([
    Cotizacion.find(query)
      .sort({ recibidaEn: 1 })
      .skip(skip)
      .limit(pageSize)
      .populate("asignadaA", "nombre email rol"),
    Cotizacion.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: pageNum,
    limit: pageSize,
  };
}

// Marca una cotización como en gestión y asignada a un usuario
async function marcarCotizacionEnGestion({ cotizacionId, usuarioId }) {
  const cotizacion = await Cotizacion.findById(cotizacionId);

  if (!cotizacion) {
    const error = new Error("Cotización no encontrada");
    error.status = 404;
    error.code = "QUOTE_NOT_FOUND";
    throw error;
  }

  if (!usuarioId) {
    const error = new Error("Usuario asignado requerido");
    error.status = 400;
    error.code = "ASSIGNEE_REQUIRED";
    throw error;
  }

  cotizacion.estado = "EN_GESTION";
  cotizacion.asignadaA = usuarioId;

  await cotizacion.save();

  return cotizacion;
}

// Marca una cotización como respondida y calcula tiempo de gestión
async function marcarCotizacionRespondida({ cotizacionId, usuarioId, respondedAt }) {
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
  }

  if (!cotizacion.tiempoGestionMin && cotizacion.recibidaEn) {
    cotizacion.tiempoGestionMin = diffMinutes(cotizacion.recibidaEn, cotizacion.primeraRespuestaEn);
  }

  cotizacion.estado = "RESPONDIDA";

  if (usuarioId && !cotizacion.asignadaA) {
    cotizacion.asignadaA = usuarioId;
  }

  await cotizacion.save();

  return cotizacion;
}

// Marca una cotización como vencida
async function marcarCotizacionVencida({ cotizacionId }) {
  const cotizacion = await Cotizacion.findById(cotizacionId);

  if (!cotizacion) {
    const error = new Error("Cotización no encontrada");
    error.status = 404;
    error.code = "QUOTE_NOT_FOUND";
    throw error;
  }

  cotizacion.estado = "VENCIDA";

  await cotizacion.save();

  return cotizacion;
}

module.exports = {
  createCotizacionFromEmail,
  listCotizaciones,
  marcarCotizacionEnGestion,
  marcarCotizacionRespondida,
  marcarCotizacionVencida,
};
