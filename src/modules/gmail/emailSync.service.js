const { listMessages, getMessageById } = require("./gmail.client");
const { createCotizacionFromEmail } = require("../cotizaciones/cotizacion.service");

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

module.exports = {
  syncCotizacionesFromGmail,
  mapGmailMessageToCotizacionPayload,
};
