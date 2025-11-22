const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@example.com";
const APP_WEB_URL = process.env.APP_WEB_URL || "http://localhost:3000";
const COMPANY_VERIFICATION_EMAIL = process.env.COMPANY_VERIFICATION_EMAIL;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.warn("[Mail] Faltan variables SMTP_HOST, SMTP_USER o SMTP_PASS");
}

if (!COMPANY_VERIFICATION_EMAIL) {
  console.warn("[Mail] Falta la variable COMPANY_VERIFICATION_EMAIL");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Verifica la conexión SMTP al iniciar el servicio
transporter.verify((err) => {
  if (err) {
    console.error("[Mail] Error al verificar conexión SMTP:", err.message);
  } else {
    console.log("[Mail] Conexión SMTP verificada correctamente");
  }
});

// Construye la URL de verificación de correo para el usuario
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

  const mailOptions = {
    from: EMAIL_FROM,
    to: COMPANY_VERIFICATION_EMAIL,
    subject: "Nueva cuenta para verificar - Cubica Mail Manager",
    text: [
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
      "Si tú no esperabas este correo, puedes ignorarlo.",
    ].join("\n"),
    html: `
      <p>Se ha creado una nueva cuenta en <strong>Cubica Mail Manager</strong>.</p>
      <ul>
        <li><strong>Nombre:</strong> ${nombre}</li>
        <li><strong>Email definido en el sistema:</strong> ${usuarioEmail}</li>
        <li><strong>Rol:</strong> ${rol}</li>
      </ul>
      <p>Para activar esta cuenta y permitir que el usuario inicie sesión, haz clic en el siguiente enlace:</p>
      <p><a href="${verifyUrl}" target="_blank" rel="noopener noreferrer">${verifyUrl}</a></p>
      <p>Si tú no esperabas este correo, puedes ignorarlo.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("[Mail] Correo de verificación enviado:", info.messageId);
  } catch (err) {
    console.error("[Mail] Error al enviar correo de verificación:", err.message);
    if (err.response) {
      console.error("[Mail] Respuesta SMTP:", err.response);
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
    const recibida = c.recibidaEn ? new Date(c.recibidaEn).toISOString() : "Sin fecha";
    const asignada = c.asignadaA && c.asignadaA.nombre ? c.asignadaA.nombre : "Sin asignar";
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
      const recibida = c.recibidaEn ? new Date(c.recibidaEn).toISOString() : "Sin fecha";
      const asignada = c.asignadaA && c.asignadaA.nombre ? c.asignadaA.nombre : "Sin asignar";
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
    <p>Se han detectado cotizaciones atrasadas que llevan más tiempo del configurado sin respuesta.</p>
    <p><strong>Total:</strong> ${cotizaciones.length}</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
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
    <p>Revisa el panel de Cubica Mail Manager para gestionar estas cotizaciones.</p>
  `;
}

// Envía un correo de alerta con el listado de cotizaciones atrasadas
async function sendCotizacionesAtrasadasAlert({ cotizaciones }) {
  if (!COMPANY_VERIFICATION_EMAIL) {
    throw new Error("[Mail] Falta COMPANY_VERIFICATION_EMAIL en las variables de entorno");
  }

  if (!Array.isArray(cotizaciones) || cotizaciones.length === 0) {
    return;
  }

  const plainText = buildAtrasadasPlainText(cotizaciones);
  const html = buildAtrasadasHtml(cotizaciones);

  const mailOptions = {
    from: EMAIL_FROM,
    to: COMPANY_VERIFICATION_EMAIL,
    subject: "Alertas de cotizaciones atrasadas - Cubica Mail Manager",
    text: plainText,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("[Mail] Correo de alerta de cotizaciones atrasadas enviado:", info.messageId);
  } catch (err) {
    console.error("[Mail] Error al enviar correo de alerta de cotizaciones atrasadas:", err.message);
    if (err.response) {
      console.error("[Mail] Respuesta SMTP:", err.response);
    }
    throw err;
  }
}

module.exports = {
  sendEmailVerification,
  buildEmailVerificationUrl,
  sendCotizacionesAtrasadasAlert,
};
