const { loginWithEmailAndPassword, verifyEmailToken } = require("./auth.service");
const Usuario = require("../users/user.model");

// Limpia los datos del usuario antes de enviarlos al cliente
function sanitizeUser(usuario) {
  return {
    id: usuario._id.toString(),
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    estado: usuario.estado,
    emailVerificado: usuario.emailVerificado,
    lastLoginAt: usuario.lastLoginAt,
    createdAt: usuario.createdAt,
    updatedAt: usuario.updatedAt,
  };
}

// Controlador para manejar el inicio de sesión con email y contraseña
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "EMAIL_AND_PASSWORD_REQUIRED",
        message: "Email y contraseña son obligatorios",
      });
    }

    const { usuario, accessToken, refreshToken } =
      await loginWithEmailAndPassword(email, password);

    return res.status(200).json({
      ok: true,
      data: {
        usuario: sanitizeUser(usuario),
        tokens: {
          accessToken,
          refreshToken,
        },
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
          : err.message || "Error en el inicio de sesión",
    });
  }
}

// Controlador para devolver la información del usuario autenticado
async function me(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        ok: false,
        error: "AUTH_REQUIRED",
        message: "Autenticación requerida",
      });
    }

    const usuario = await Usuario.findById(req.user.id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        error: "USER_NOT_FOUND",
        message: "Usuario no encontrado",
      });
    }

    return res.status(200).json({
      ok: true,
      data: sanitizeUser(usuario),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Error interno del servidor",
    });
  }
}

// Controlador para verificar el correo a partir de un token recibido
async function verifyEmail(req, res) {
  try {
    const token =
      req.body.token ||
      req.query.token ||
      (req.params && req.params.token) ||
      null;

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_TOKEN",
        message: "Token de verificación requerido",
      });
    }

    const usuario = await verifyEmailToken(token);

    return res.status(200).json({
      ok: true,
      data: {
        usuario: sanitizeUser(usuario),
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
          : err.message || "Error al verificar el correo",
    });
  }
}

module.exports = {
  login,
  me,
  verifyEmail,
};
