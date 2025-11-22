const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Usuario = require("./user.model");
const { sendEmailVerification } = require("../mail/mail.service");

// Tiempo de validez del token de verificación de correo en horas
const EMAIL_VERIFICATION_TTL_HOURS = 24;

// Genera el hash seguro para una contraseña en texto plano
async function hashPassword(plainPassword) {
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
}

// Genera un token de verificación de correo y su fecha de expiración
function generateEmailVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
  return { token, expiresAt };
}

// Crea un nuevo usuario con rol ADMIN o AGENTE y envía el correo de verificación a la empresa
async function createUser({ email, nombre, rol, password, createdBy }) {
  const emailNormalizado = email.toLowerCase().trim();

  const existing = await Usuario.findOne({ email: emailNormalizado });
  if (existing) {
    const error = new Error("El email ya está registrado");
    error.status = 409;
    error.code = "EMAIL_ALREADY_EXISTS";
    throw error;
  }

  if (!["ADMIN", "AGENTE"].includes(rol)) {
    const error = new Error("Rol inválido");
    error.status = 400;
    error.code = "INVALID_ROLE";
    throw error;
  }

  const passwordHash = await hashPassword(password);

  const { token, expiresAt } = generateEmailVerificationToken();

  const usuario = new Usuario({
    email: emailNormalizado,
    nombre,
    rol,
    passwordHash,
    estado: "pendiente_email",
    emailVerificado: false,
    intentosLoginFallidos: 0,
    lockedUntil: null,
    createdBy: createdBy || null,
    emailVerificationToken: token,
    emailVerificationExpiresAt: expiresAt,
  });

  await usuario.save();

  await sendEmailVerification({
    usuarioEmail: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    token,
  });

  return {
    usuario,
    emailVerificationToken: token,
  };
}

module.exports = {
  createUser,
};
