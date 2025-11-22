const { createUser } = require("./user.service");

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

// Controlador para crear un nuevo usuario desde un administrador
async function createUserByAdmin(req, res) {
  try {
    const { email, nombre, rol, password } = req.body;

    if (!email || !nombre || !rol || !password) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_FIELDS",
        message: "Email, nombre, rol y contraseña son obligatorios",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "WEAK_PASSWORD",
        message: "La contraseña debe tener al menos 8 caracteres",
      });
    }

    const createdBy = req.user ? req.user.id : null;

    const { usuario, emailVerificationToken } = await createUser({
      email,
      nombre,
      rol,
      password,
      createdBy,
    });

    return res.status(201).json({
      ok: true,
      data: {
        usuario: sanitizeUser(usuario),
        emailVerificationToken,
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
          : err.message || "Error al crear el usuario",
    });
  }
}

module.exports = {
  createUserByAdmin,
};
