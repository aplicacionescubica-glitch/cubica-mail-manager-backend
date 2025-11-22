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

// Construye la URL de verificación de correo para el usuario
function buildEmailVerificationUrl(token) {
  const base = APP_WEB_URL.replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

// Envía un correo de verificación al correo de la empresa con datos del usuario creado
async function sendEmailVerification({ usuarioEmail, nombre, rol, token }) {
  if (!transporter) {
    throw new Error("[Mail] No hay transporter configurado");
  }

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

  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendEmailVerification,
  buildEmailVerificationUrl,
};
