const {
  listCotizaciones,
  marcarCotizacionEnGestion,
  marcarCotizacionRespondida,
  marcarCotizacionVencida,
  findCotizacionesPendientesParaAlerta,
  responderCotizacion: responderCotizacionService,
} = require("./cotizacion.service");
const { sendCotizacionesAtrasadasAlert } = require("../mail/mail.service");
const {
  syncCotizacionesFromGmail,
  syncRespuestasFromGmail,
} = require("../gmail/emailSync.service");

// Limpia los datos de la cotización antes de enviarlos al cliente
function sanitizeCotizacion(c) {
  return {
    id: c._id.toString(),
    emailMessageId: c.emailMessageId,
    emailThreadId: c.emailThreadId,
    asunto: c.asunto,
    remitenteNombre: c.remitenteNombre,
    remitenteEmail: c.remitenteEmail,
    para: c.para || [],
    cc: c.cc || [],
    preview: c.preview,
    recibidaEn: c.recibidaEn,
    estado: c.estado,
    asignadaA: c.asignadaA
      ? {
          id: c.asignadaA._id.toString(),
          nombre: c.asignadaA.nombre,
          email: c.asignadaA.email,
          rol: c.asignadaA.rol,
        }
      : null,
    primeraRespuestaEn: c.primeraRespuestaEn,
    tiempoGestionMin: c.tiempoGestionMin,
    notasInternas: c.notasInternas || "",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// Lista cotizaciones con filtros y orden por antigüedad
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

// Marca una cotización como EN_GESTION
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

// Marca una cotización como RESPONDIDA
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

// Responde una cotización y actualiza su estado y tiempos
async function responderCotizacion(req, res) {
  try {
    const { id } = req.params;
    const { mensajeHtml, mensajeTexto, asunto, cc } = req.body || {};

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_QUOTE_ID",
        message: "El id de la cotización es obligatorio",
      });
    }

    const usuarioId = req.user ? req.user.id : null;

    const result = await responderCotizacionService({
      cotizacionId: id,
      usuarioId,
      mensajeHtml,
      mensajeTexto,
      asunto,
      cc,
    });

    return res.status(200).json({
      ok: true,
      data: {
        cotizacion: sanitizeCotizacion(result.cotizacion),
        emailInfo: result.emailInfo || null,
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
          : err.message || "Error al responder la cotización",
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

// Notifica por correo las cotizaciones atrasadas
async function notificarCotizacionesPendientes(req, res) {
  try {
    const { minutosUmbral } = req.body || {};
    const umbral = minutosUmbral ? Number(minutosUmbral) : 60;

    const cotizaciones = await findCotizacionesPendientesParaAlerta({
      minutosUmbral: umbral,
    });

    if (!cotizaciones.length) {
      return res.status(200).json({
        ok: true,
        data: {
          totalAtrasadas: 0,
          emailEnviado: false,
        },
      });
    }

    await sendCotizacionesAtrasadasAlert({ cotizaciones });

    return res.status(200).json({
      ok: true,
      data: {
        totalAtrasadas: cotizaciones.length,
        emailEnviado: true,
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
          : err.message || "Error al notificar cotizaciones atrasadas",
    });
  }
}

// Sincroniza cotizaciones desde Gmail (entrantes y respuestas enviadas)
async function sincronizarCotizacionesDesdeGmail(req, res) {
  try {
    const { q, maxMessages } = req.body || {};

    const inboxSummary = await syncCotizacionesFromGmail({
      q: q || undefined,
      maxMessages: maxMessages ? Number(maxMessages) : 20,
    });

    const sentSummary = await syncRespuestasFromGmail({
      q: undefined,
      maxMessages: maxMessages ? Number(maxMessages) : 50,
    });

    return res.status(200).json({
      ok: true,
      data: {
        inbox: inboxSummary,
        sent: sentSummary,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || "INTERNAL_ERROR";

    console.error("[sincronizarCotizacionesDesdeGmail] error:", err);

    return res.status(status).json({
      ok: false,
      error: code,
      message: err.message || "Error al sincronizar cotizaciones desde Gmail",
    });
  }
}

module.exports = {
  listarCotizaciones,
  marcarEnGestion,
  marcarRespondida,
  marcarVencida,
  responderCotizacion,
  notificarCotizacionesPendientes,
  sincronizarCotizacionesDesdeGmail,
};
