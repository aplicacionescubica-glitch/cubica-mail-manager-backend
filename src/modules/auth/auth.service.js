const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../users/user.model");

// Límite de intentos fallidos permitidos
const MAX_FAILED_ATTEMPTS = 5;

// Tiempo de bloqueo temporal en minutos después de exceder los intentos
const LOCK_TIME_MINUTES = 15;

// Configuración de JWT
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error("[Auth] Faltan las variables JWT_ACCESS_SECRET o JWT_REFRESH_SECRET");
}

// Genera un token de acceso con datos básicos del usuario
function generateAccessToken(usuario) {
  const payload = {
    sub: usuario._id.toString(),
    email: usuario.email,
    rol: usuario.rol,
  };

  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// Genera un token de refresco asociado al usuario
function generateRefreshToken(usuario) {
  const payload = {
    sub: usuario._id.toString(),
    type: "refresh",
  };

  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

// Verifica una contraseña contra el hash almacenado
async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

// Registra un intento de login fallido y bloquea si se supera el límite
async function registerFailedLogin(usuario) {
  usuario.intentosLoginFallidos += 1;

  if (usuario.intentosLoginFallidos >= MAX_FAILED_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
    usuario.lockedUntil = lockUntil;
  }

  await usuario.save();
}

// Resetea intentos fallidos y actualiza último login al tener éxito
async function resetLoginAttempts(usuario) {
  usuario.intentosLoginFallidos = 0;
  usuario.lockedUntil = null;
  usuario.lastLoginAt = new Date();
  await usuario.save();
}

// Verifica si la cuenta está bloqueada temporalmente
function isAccountLocked(usuario) {
  if (!usuario.lockedUntil) return false;
  return usuario.lockedUntil.getTime() > Date.now();
}

// Lógica principal de login con email y contraseña
async function loginWithEmailAndPassword(email, plainPassword) {
  const usuario = await Usuario.findOne({ email: email.toLowerCase().trim() });

  if (!usuario) {
    const error = new Error("Credenciales inválidas");
    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }

  if (isAccountLocked(usuario)) {
    const error = new Error("Cuenta bloqueada por intentos fallidos");
    error.status = 403;
    error.code = "ACCOUNT_LOCKED";
    throw error;
  }

  if (!usuario.emailVerificado || usuario.estado === "pendiente_email") {
    const error = new Error("Correo no verificado");
    error.status = 403;
    error.code = "EMAIL_NOT_VERIFIED";
    throw error;
  }

  if (usuario.estado === "bloqueado") {
    const error = new Error("Cuenta bloqueada por administrador");
    error.status = 403;
    error.code = "ACCOUNT_BLOCKED";
    throw error;
  }

  const passwordOk = await verifyPassword(plainPassword, usuario.passwordHash);

  if (!passwordOk) {
    await registerFailedLogin(usuario);
    const error = new Error("Credenciales inválidas");
    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }

  await resetLoginAttempts(usuario);

  const accessToken = generateAccessToken(usuario);
  const refreshToken = generateRefreshToken(usuario);

  return {
    usuario,
    accessToken,
    refreshToken,
  };
}

// Verifica el token de email, activa la cuenta y limpia el token
async function verifyEmailToken(token) {
  if (!token || typeof token !== "string") {
    const error = new Error("Token de verificación inválido");
    error.status = 400;
    error.code = "INVALID_VERIFICATION_TOKEN";
    throw error;
  }

  const now = new Date();

  const usuario = await Usuario.findOne({
    emailVerificationToken: token,
    emailVerificationExpiresAt: { $gt: now },
  });

  if (!usuario) {
    const error = new Error("Token de verificación no válido o expirado");
    error.status = 400;
    error.code = "VERIFICATION_TOKEN_NOT_FOUND";
    throw error;
  }

  usuario.emailVerificado = true;

  if (usuario.estado === "pendiente_email") {
    usuario.estado = "activo";
  }

  usuario.emailVerificationToken = null;
  usuario.emailVerificationExpiresAt = null;

  await usuario.save();

  return usuario;
}

module.exports = {
  loginWithEmailAndPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyEmailToken,
};
