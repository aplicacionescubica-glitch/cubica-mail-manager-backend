const {
  listCotizaciones,
  marcarCotizacionEnGestion,
  marcarCotizacionRespondida,
  marcarCotizacionVencida,
} = require("./cotizacion.service");

// Limpia los datos de la cotización antes de enviarlos al cliente
function sanitizeCotizacion(c) {
  return {
    id: c._id.toString(),
    emailMessageId: c.emailMessageId,
    emailThreadId: c.emailThreadId,
    asunto: c.asunto,
    remitenteNombre: c.remitenteNombre,
    remitenteEmail: c.remitenteEmail,
    para: c.para,
    cc: c.cc,
    preview: c.preview,
    recibidaEn: c.recibidaEn,
    primeraRespuestaEn: c.primeraRespuestaEn,
    estado: c.estado,
    asignadaA: c.asignadaA
      ? {
          id: c.asignadaA._id.toString(),
          nombre: c.asignadaA.nombre,
          email: c.asignadaA.email,
          rol: c.asignadaA.rol,
        }
      : null,
    tiempoGestionMin: c.tiempoGestionMin,
    notasInternas: c.notasInternas,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// Controlador para listar cotizaciones con filtros y orden por antigüedad
async function listarCotizaciones(req, res) {
  try {
    const { estado, asignadaA, page, limit } = req.query;

    const result = await listCotizaciones({
      estado: estado || undefined,
      asignadaA: asignadaA || undefined,
      page: page || 1,
      limit: limit || 20,
    });

    return res.status(200).json({
      ok: true,
      data: {
        items: result.items.map(sanitizeCotizacion),
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || "INTERNAL_ERROR";

    return res.status(status).json({
      ok: false,
      error: code,
      message:
        status === 500
          ? "Error interno del servidor"
          : err.message || "Error al listar cotizaciones",
    });
  }
}

// Controlador para marcar una cotización como en gestión
async function marcarEnGestion(req, res) {
  try {
    const { id } = req.params;
    const { asignadaA } = req.body;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_QUOTE_ID",
        message: "El id de la cotización es obligatorio",
      });
    }

    const usuarioId = asignadaA || (req.user ? req.user.id : null);
    const cotizacion = await marcarCotizacionEnGestion({
      cotizacionId: id,
      usuarioId,
    });

    return res.status(200).json({
      ok: true,
      data: {
        cotizacion: sanitizeCotizacion(cotizacion),
      },
    });
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || "INTERNAL_ERROR";

    return res.status(status).json({
      ok: false,
      error: code,
      message:
        status === 500
          ? "Error interno del servidor"
          : err.message || "Error al marcar la cotización en gestión",
    });
  }
}

// Controlador para marcar una cotización como respondida
async function marcarRespondida(req, res) {
  try {
    const { id } = req.params;
    const { respondedAt } = req.body;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_QUOTE_ID",
        message: "El id de la cotización es obligatorio",
      });
    }

    const usuarioId = req.user ? req.user.id : null;

    const cotizacion = await marcarCotizacionRespondida({
      cotizacionId: id,
      usuarioId,
      respondedAt: respondedAt || undefined,
    });

    return res.status(200).json({
      ok: true,
      data: {
        cotizacion: sanitizeCotizacion(cotizacion),
      },
    });
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || "INTERNAL_ERROR";

    return res.status(status).json({
      ok: false,
      error: code,
      message:
        status === 500
          ? "Error interno del servidor"
          : err.message || "Error al marcar la cotización como respondida",
    });
  }
}

// Controlador para marcar una cotización como vencida
async function marcarVencida(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_QUOTE_ID",
        message: "El id de la cotización es obligatorio",
      });
    }

    const cotizacion = await marcarCotizacionVencida({
      cotizacionId: id,
    });

    return res.status(200).json({
      ok: true,
      data: {
        cotizacion: sanitizeCotizacion(cotizacion),
      },
    });
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || "INTERNAL_ERROR";

    return res.status(status).json({
      ok: false,
      error: code,
      message:
        status === 500
          ? "Error interno del servidor"
          : err.message || "Error al marcar la cotización como vencida",
    });
  }
}

module.exports = {
  listarCotizaciones,
  marcarEnGestion,
  marcarRespondida,
  marcarVencida,
};
