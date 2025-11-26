const nodemailer = require("nodemailer");
const { sendGmailMessage } = require("../gmail/gmail.client");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@example.com";
const APP_WEB_URL = process.env.APP_WEB_URL || "http://localhost:3000";
const COMPANY_VERIFICATION_EMAIL = process.env.COMPANY_VERIFICATION_EMAIL;
const USE_GMAIL_API_FOR_MAIL = process.env.USE_GMAIL_API_FOR_MAIL === "true";
const GMAIL_ACCOUNT_EMAIL = process.env.GMAIL_ACCOUNT_EMAIL;
const PENDING_ALERTS_TO_EMAIL =
  process.env.PENDING_ALERTS_TO_EMAIL || GMAIL_ACCOUNT_EMAIL || COMPANY_VERIFICATION_EMAIL;

if (!COMPANY_VERIFICATION_EMAIL) {
  console.warn("[Mail] Falta la variable COMPANY_VERIFICATION_EMAIL");
}

if (!USE_GMAIL_API_FOR_MAIL && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) {
  console.warn("[Mail] Faltan variables SMTP_HOST, SMTP_USER o SMTP_PASS y USE_GMAIL_API_FOR_MAIL es false");
}

// Crea el transporter SMTP reutilizable solo si no usamos Gmail API
let transporter = null;

if (!USE_GMAIL_API_FOR_MAIL && SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  transporter.verify((err) => {
    if (err) {
      console.error("[Mail] Error al verificar conexión SMTP:", err.message);
    } else {
      console.log("[Mail] Conexión SMTP verificada correctamente");
    }
  });
}

// Envía un correo usando Gmail API o SMTP según configuración
async function sendMail({ to, cc, subject, text, html, inReplyTo, references }) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error("[Mail] Campo 'to' es obligatorio para enviar correo");
  }

  // Rama Gmail API
  if (USE_GMAIL_API_FOR_MAIL) {
    const info = await sendGmailMessage({
      from: EMAIL_FROM,
      to,
      cc,
      subject,
      text,
      html,
    });

    const id = info && (info.id || info.messageId);
    console.log("[Mail] Correo enviado vía Gmail API:", id || "(sin id)");
    return info;
  }

  // Rama SMTP
  if (!transporter) {
    throw new Error("[Mail] No hay transporte SMTP disponible y USE_GMAIL_API_FOR_MAIL es false");
  }

  const mailOptions = {
    from: EMAIL_FROM,
    to,
    cc: cc && cc.length ? cc : undefined,
    subject,
    text,
    html,
  };

  // Estos headers solo aplican a SMTP
  if (inReplyTo) {
    mailOptions.inReplyTo = inReplyTo;
  }
  if (references && references.length) {
    mailOptions.references = references;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log("[Mail] Correo enviado vía SMTP:", info.messageId);
  return info;
}

// Construye la URL de verificación de usuario
function buildEmailVerificationUrl(token) {
  const base = APP_WEB_URL.replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

// Envía un correo de verificación al correo de la empresa con datos del usuario creado
async function sendEmailVerification({ usuarioEmail, nombre, rol, token }) {
  if (!COMPANY_VERIFICATION_EMAIL) {
    throw new Error("[Mail] Falta COMPANY_VERIFICATION_EMAIL en las variables de entorno");
  }

  const verifyUrl = buildEmailVerificationUrl(token);

  const textLines = [
    "Se ha creado una nueva cuenta en Cubica Mail Manager.",
    "",
    `Nombre: ${nombre}`,
    `Email definido en el sistema: ${usuarioEmail}`,
    `Rol: ${rol}`,
    "",
    "Para activar esta cuenta y permitir que el usuario inicie sesión, utiliza el siguiente enlace de verificación:",
    "",
    verifyUrl,
    "",
    "Si tú no realizaste esta acción, revisa la configuración del sistema.",
  ];

  const html = `
    <p>Se ha creado una nueva cuenta en <strong>Cubica Mail Manager</strong>.</p>
    <p><strong>Nombre:</strong> ${nombre}<br/>
    <strong>Email definido en el sistema:</strong> ${usuarioEmail}<br/>
    <strong>Rol:</strong> ${rol}</p>
    <p>Para activar esta cuenta y permitir que el usuario inicie sesión, utiliza el siguiente enlace de verificación:</p>
    <p><a href="${verifyUrl}" target="_blank" rel="noopener noreferrer">${verifyUrl}</a></p>
    <p>Si tú no realizaste esta acción, revisa la configuración del sistema.</p>
  `;

  try {
    const info = await sendMail({
      to: COMPANY_VERIFICATION_EMAIL,
      subject: "Nueva cuenta para verificar - Cubica Mail Manager",
      text: textLines.join("\n"),
      html,
    });
    return info;
  } catch (err) {
    console.error("[Mail] Error al enviar correo de verificación:", err.message);
    if (err.response) {
      console.error("[Mail] Respuesta de envío:", err.response);
    }
    throw err;
  }
}

// Construye el contenido de texto para el resumen de cotizaciones atrasadas
function buildAtrasadasPlainText(cotizaciones) {
  const encabezado = [
    "Resumen de cotizaciones atrasadas",
    "",
    `Total: ${cotizaciones.length}`,
    "",
  ];

  const lineas = cotizaciones.map((c, index) => {
    const recibida = c.recibidaEn ? new Date(c.recibidaEn).toLocaleString() : "N/D";
    const asignada =
      c.asignadaA && c.asignadaA.nombre
        ? `${c.asignadaA.nombre} <${c.asignadaA.email}>`
        : "Sin asignar";

    return [
      `#${index + 1}`,
      `Asunto: ${c.asunto}`,
      `Remitente: ${c.remitenteNombre || ""} <${c.remitenteEmail}>`,
      `Recibida en: ${recibida}`,
      `Estado: ${c.estado}`,
      `Asignada a: ${asignada}`,
      "",
    ].join("\n");
  });

  return [...encabezado, ...lineas].join("\n");
}

// Construye el contenido HTML para el resumen de cotizaciones atrasadas
function buildAtrasadasHtml(cotizaciones) {
  const filas = cotizaciones
    .map((c, index) => {
      const recibida = c.recibidaEn ? new Date(c.recibidaEn).toLocaleString() : "N/D";
      const asignada =
        c.asignadaA && c.asignadaA.nombre
          ? `${c.asignadaA.nombre} &lt;${c.asignadaA.email}&gt;`
          : "Sin asignar";

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${c.asunto}</td>
          <td>${c.remitenteNombre || ""} &lt;${c.remitenteEmail}&gt;</td>
          <td>${recibida}</td>
          <td>${c.estado}</td>
          <td>${asignada}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <p>Se han detectado las siguientes cotizaciones atrasadas en Cubica Mail Manager:</p>
    <p><strong>Total:</strong> ${cotizaciones.length}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background:#f2f2f2;">
          <th>#</th>
          <th>Asunto</th>
          <th>Remitente</th>
          <th>Recibida en</th>
          <th>Estado</th>
          <th>Asignada a</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>
    <p>Revisa estas cotizaciones en el sistema para darles seguimiento.</p>
  `;
}

// Envía un correo de alerta con el resumen de cotizaciones atrasadas
async function sendCotizacionesAtrasadasAlert({ cotizaciones }) {
  if (!Array.isArray(cotizaciones) || cotizaciones.length === 0) {
    return;
  }

  if (!PENDING_ALERTS_TO_EMAIL) {
    console.warn("[Mail] No hay correo configurado para alertas de cotizaciones atrasadas");
    return;
  }

  const plainText = buildAtrasadasPlainText(cotizaciones);
  const html = buildAtrasadasHtml(cotizaciones);
  const subject = "Alertas de cotizaciones atrasadas - Cubica Mail Manager";

  const cc =
    COMPANY_VERIFICATION_EMAIL &&
    COMPANY_VERIFICATION_EMAIL !== PENDING_ALERTS_TO_EMAIL
      ? COMPANY_VERIFICATION_EMAIL
      : undefined;

  try {
    const info = await sendMail({
      to: PENDING_ALERTS_TO_EMAIL,
      cc,
      subject,
      text: plainText,
      html,
    });
    return info;
  } catch (err) {
    console.error("[Mail] Error al enviar correo de alerta de cotizaciones atrasadas:", err.message);
    if (err.response) {
      console.error("[Mail] Respuesta de envío:", err.response);
    }
    throw err;
  }
}

// Envía una respuesta de cotización al remitente
async function sendCotizacionReply({ to, cc, subject, text, html, inReplyTo }) {
  if (!to) {
    throw new Error("[Mail] Falta el destinatario para la respuesta de cotización");
  }

  const references = inReplyTo ? [inReplyTo] : undefined;

  try {
    const info = await sendMail({
      to,
      cc,
      subject,
      text,
      html,
      inReplyTo,
      references,
    });
    return info;
  } catch (err) {
    console.error("[Mail] Error al enviar respuesta de cotización:", err.message);
    if (err.response) {
      console.error("[Mail] Respuesta de envío:", err.response);
    }
    throw err;
  }
}

module.exports = {
  sendEmailVerification,
  buildEmailVerificationUrl,
  sendCotizacionesAtrasadasAlert,
  sendCotizacionReply,
};
