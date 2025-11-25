const { listMessages, getMessageById } = require("./gmail.client");
const { createCotizacionFromEmail, marcarCotizacionRespondida } = require("../cotizaciones/cotizacion.service");
const { Cotizacion } = require("../cotizaciones/cotizacion.model");

const COTIZ_KEYWORDS = (process.env.COTIZ_KEYWORDS || "cotizacion,cotización,cotiz,presupuesto,quote")
  .split(",")
  .map((s) => s.toLowerCase().trim())
  .filter(Boolean);

const COTIZ_INTERNAL_EMAILS = (process.env.COTIZ_INTERNAL_EMAILS || "")
  .split(",")
  .map((s) => s.toLowerCase().trim())
  .filter(Boolean);

const COTIZ_MIN_SCORE = Number(process.env.COTIZ_MIN_SCORE || 2);

// Correo de la cuenta que usa la app para enviar y responder
const GMAIL_ACCOUNT_EMAIL = (process.env.GMAIL_ACCOUNT_EMAIL || "").toLowerCase();

// Query por defecto para buscar respuestas en enviados
// Ejemplo recomendado en .env: GMAIL_SENT_QUERY=in:sent newer_than:7d
const GMAIL_SENT_QUERY = process.env.GMAIL_SENT_QUERY || "in:sent newer_than:7d";

// Obtiene el valor de un header específico por nombre
function getHeader(headers, name) {
  if (!Array.isArray(headers)) return null;
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : null;
}

// Parsea una lista de correos de un header (To, Cc) y devuelve solo los emails
function parseEmailList(headerValue) {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/<([^>]+)>/);
      if (match && match[1]) {
        return match[1].trim();
      }
      return part.replace(/"/g, "").trim();
    });
}

// Parsea el remitente en nombre y email a partir del header From
function parseFromHeader(fromValue) {
  if (!fromValue) {
    return { name: "", email: "" };
  }

  const match = fromValue.match(/^(.*)<([^>]+)>/);
  if (match && match[2]) {
    const name = match[1] ? match[1].replace(/"/g, "").trim() : "";
    const email = match[2].trim();
    return { name, email };
  }

  return {
    name: "",
    email: fromValue.replace(/"/g, "").trim(),
  };
}

// Determina si un mensaje debe tratarse como cotización usando reglas simples
function esCotizacionDesdePayload(payload) {
  if (!payload) return false;

  const subject = (payload.asunto || "").toLowerCase();
  const preview = (payload.preview || "").toLowerCase();
  const remitenteEmail = (payload.remitenteEmail || "").toLowerCase();
  const para = Array.isArray(payload.para) ? payload.para : [];
  const cc = Array.isArray(payload.cc) ? payload.cc : [];

  const text = `${subject} ${preview}`;

  let score = 0;

  if (COTIZ_KEYWORDS.length && COTIZ_KEYWORDS.some((kw) => text.includes(kw))) {
    score += 2;
  }

  const recipients = [...para, ...cc].map((e) => String(e).toLowerCase());
  if (COTIZ_INTERNAL_EMAILS.length && recipients.length) {
    if (COTIZ_INTERNAL_EMAILS.some((email) => recipients.some((r) => r.includes(email)))) {
      score += 1;
    }
  }

  if (!remitenteEmail) {
    score -= 1;
  }

  const minScore = Number.isFinite(COTIZ_MIN_SCORE) ? COTIZ_MIN_SCORE : 2;
  return score >= minScore;
}

// Convierte un mensaje de Gmail al payload esperado por createCotizacionFromEmail
function mapGmailMessageToCotizacionPayload(message) {
  const payload = message && message.payload ? message.payload : {};
  const headers = payload.headers || [];

  const subject = getHeader(headers, "Subject") || "(sin asunto)";
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const cc = getHeader(headers, "Cc");
  const dateHeader = getHeader(headers, "Date");

  const { name: remitenteNombre, email: remitenteEmail } = parseFromHeader(from);

  const paraList = parseEmailList(to);
  const ccList = parseEmailList(cc);

  let recibidaEn = null;
  if (dateHeader) {
    const d = new Date(dateHeader);
    if (!Number.isNaN(d.getTime())) {
      recibidaEn = d.toISOString();
    }
  }
  if (!recibidaEn && message.internalDate) {
    const d = new Date(Number(message.internalDate));
    if (!Number.isNaN(d.getTime())) {
      recibidaEn = d.toISOString();
    }
  }

  const preview = message.snippet || "";

  return {
    emailMessageId: message.id,
    emailThreadId: message.threadId,
    asunto: subject,
    remitenteNombre,
    remitenteEmail,
    para: paraList,
    cc: ccList,
    preview,
    recibidaEn,
  };
}

// Sincroniza mensajes de Gmail como cotizaciones en la base de datos
async function syncCotizacionesFromGmail({ q, maxMessages = 50 } = {}) {
  const summary = {
    totalMessages: 0,
    processed: 0,
    created: 0,
    reused: 0,
    errors: 0,
    details: [],
  };

  const { messages } = await listMessages({ q, maxResults: maxMessages });

  if (!messages || !messages.length) {
    return summary;
  }

  summary.totalMessages = messages.length;

  for (const msg of messages) {
    try {
      const fullMessage = await getMessageById(msg.id);
      const payload = mapGmailMessageToCotizacionPayload(fullMessage);

      if (!payload.recibidaEn || !payload.remitenteEmail) {
        summary.details.push({
          messageId: msg.id,
          status: "skipped",
          reason: "missing_required_fields",
        });
        continue;
      }

      if (!esCotizacionDesdePayload(payload)) {
        summary.details.push({
          messageId: msg.id,
          status: "skipped",
          reason: "not_a_quote",
        });
        continue;
      }

      const result = await createCotizacionFromEmail(payload);

      summary.processed += 1;
      if (result.created) {
        summary.created += 1;
        summary.details.push({
          messageId: msg.id,
          status: "created",
          cotizacionId: result.cotizacion._id.toString(),
        });
      } else {
        summary.reused += 1;
        summary.details.push({
          messageId: msg.id,
          status: "reused",
          cotizacionId: result.cotizacion._id.toString(),
        });
      }
    } catch (err) {
      summary.errors += 1;
      summary.details.push({
        messageId: msg.id,
        status: "error",
        error: err.message || String(err),
      });
    }
  }

  return summary;
}

// Sincroniza respuestas enviadas desde Gmail y actualiza cotizaciones
async function syncRespuestasFromGmail({ q, maxMessages = 50 } = {}) {
  const summary = {
    totalMessages: 0,
    processed: 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const query = q || GMAIL_SENT_QUERY;

  const { messages } = await listMessages({ q: query, maxResults: maxMessages });

  if (!messages || !messages.length) {
    return summary;
  }

  summary.totalMessages = messages.length;

  for (const msg of messages) {
    try {
      const fullMessage = await getMessageById(msg.id);
      const payload = fullMessage && fullMessage.payload ? fullMessage.payload : {};
      const headers = payload.headers || [];

      const fromHeader = getHeader(headers, "From");
      const { email: fromEmail } = parseFromHeader(fromHeader);

      if (!fromEmail) {
        summary.skipped += 1;
        summary.details.push({
          messageId: msg.id,
          status: "skipped",
          reason: "missing_from",
        });
        continue;
      }

      // Si está configurado GMAIL_ACCOUNT_EMAIL, solo procesamos correos enviados desde esa cuenta
      if (GMAIL_ACCOUNT_EMAIL && fromEmail.toLowerCase() !== GMAIL_ACCOUNT_EMAIL) {
        summary.skipped += 1;
        summary.details.push({
          messageId: msg.id,
          status: "skipped",
          reason: "not_from_account",
        });
        continue;
      }

      const threadId = fullMessage.threadId;
      if (!threadId) {
        summary.skipped += 1;
        summary.details.push({
          messageId: msg.id,
          status: "skipped",
          reason: "missing_thread_id",
        });
        continue;
      }

      const cotizacion = await Cotizacion.findOne({ emailThreadId: threadId });
      if (!cotizacion) {
        summary.skipped += 1;
        summary.details.push({
          messageId: msg.id,
          status: "skipped",
          reason: "no_matching_quote",
        });
        continue;
      }

      let respondedAt = new Date();
      const dateHeader = getHeader(headers, "Date");
      if (dateHeader) {
        const d = new Date(dateHeader);
        if (!Number.isNaN(d.getTime())) {
          respondedAt = d;
        }
      } else if (fullMessage.internalDate) {
        const d = new Date(Number(fullMessage.internalDate));
        if (!Number.isNaN(d.getTime())) {
          respondedAt = d;
        }
      }

      const updated = await marcarCotizacionRespondida({
        cotizacionId: cotizacion._id.toString(),
        usuarioId: null,
        respondedAt: respondedAt.toISOString(),
      });

      summary.processed += 1;
      summary.matched += 1;
      summary.updated += 1;
      summary.details.push({
        messageId: msg.id,
        status: "updated",
        cotizacionId: updated._id.toString(),
      });
    } catch (err) {
      summary.errors += 1;
      summary.details.push({
        messageId: msg.id,
        status: "error",
        error: err.message || String(err),
      });
    }
  }

  return summary;
}

module.exports = {
  syncCotizacionesFromGmail,
  syncRespuestasFromGmail,
  mapGmailMessageToCotizacionPayload,
};
