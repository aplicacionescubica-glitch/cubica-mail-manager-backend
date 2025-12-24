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
  const expiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000
  );
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

  if (!["ADMIN", "AGENT"].includes(rol)) {
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

  try {
    await sendEmailVerification({
      usuarioEmail: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      token,
    });
  } catch (err) {
    console.warn("[Mail] Error al enviar correo de verificación:", err.message);
  }

  return {
    usuario,
    emailVerificationToken: token,
  };
}

// Lista usuarios con filtros opcionales y paginación básica
async function listUsers({ estado, rol, page = 1, limit = 20 } = {}) {
  const query = {};

  if (estado) {
    query.estado = estado;
  }

  if (rol) {
    query.rol = rol;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * pageSize;

  const [items, total] = await Promise.all([
    Usuario.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
    Usuario.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: pageNum,
    limit: pageSize,
  };
}

// Actualiza datos básicos de un usuario desde un administrador
async function updateUser({ userId, updates, currentAdminId }) {
  const usuario = await Usuario.findById(userId);

  if (!usuario) {
    const error = new Error("Usuario no encontrado");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  if (usuario._id.toString() === currentAdminId) {
    if (
      typeof updates.rol !== "undefined" ||
      typeof updates.estado !== "undefined"
    ) {
      const error = new Error("No puedes modificar tu propio rol o estado");
      error.status = 400;
      error.code = "CANNOT_UPDATE_SELF_ROLE_OR_STATE";
      throw error;
    }
  }

  if (typeof updates.email !== "undefined") {
    const error = new Error("No se permite modificar el email del usuario");
    error.status = 400;
    error.code = "EMAIL_UPDATE_NOT_ALLOWED";
    throw error;
  }

  const allowedEstados = ["activo", "bloqueado", "pendiente_email"];
  const allowedRoles = ["ADMIN", "AGENT"];

  if (typeof updates.estado !== "undefined") {
    if (!allowedEstados.includes(updates.estado)) {
      const error = new Error("Estado inválido");
      error.status = 400;
      error.code = "INVALID_STATUS";
      throw error;
    }
    usuario.estado = updates.estado;
  }

  if (typeof updates.rol !== "undefined") {
    if (!allowedRoles.includes(updates.rol)) {
      const error = new Error("Rol inválido");
      error.status = 400;
      error.code = "INVALID_ROLE";
      throw error;
    }
    usuario.rol = updates.rol;
  }

  if (typeof updates.nombre !== "undefined") {
    usuario.nombre = String(updates.nombre).trim();
  }

  await usuario.save();

  return usuario;
}

// Elimina un usuario desde un administrador
async function deleteUser({ userId, currentAdminId }) {
  const usuario = await Usuario.findById(userId);

  if (!usuario) {
    const error = new Error("Usuario no encontrado");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  if (usuario._id.toString() === String(currentAdminId || "")) {
    const error = new Error("No puedes eliminar tu propia cuenta");
    error.status = 400;
    error.code = "CANNOT_DELETE_SELF";
    throw error;
  }

  // Evita eliminar el último ADMIN
  if (usuario.rol === "ADMIN") {
    const admins = await Usuario.countDocuments({ rol: "ADMIN" });
    if (admins <= 1) {
      const error = new Error("No se puede eliminar el último administrador");
      error.status = 400;
      error.code = "CANNOT_DELETE_LAST_ADMIN";
      throw error;
    }
  }

  await Usuario.deleteOne({ _id: usuario._id });

  return usuario;
}

module.exports = {
  createUser,
  listUsers,
  updateUser,
  deleteUser,
};
