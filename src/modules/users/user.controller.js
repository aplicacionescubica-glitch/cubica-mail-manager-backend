const { createUser, listUsers, updateUser, deleteUser } = require("./user.service");

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

// Controlador para listar usuarios con filtros y paginación para administradores
async function listUsersByAdmin(req, res) {
  try {
    const { estado, rol, page, limit } = req.query;

    const result = await listUsers({
      estado: estado || undefined,
      rol: rol || undefined,
      page: page || 1,
      limit: limit || 20,
    });

    return res.status(200).json({
      ok: true,
      data: {
        items: result.items.map(sanitizeUser),
        total: result.total,
        page: result.page,
        limit: result.limit,
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
          : err.message || "Error al listar usuarios",
    });
  }
}

// Controlador para actualizar datos básicos de un usuario desde un administrador
async function updateUserByAdmin(req, res) {
  try {
    const { id } = req.params;
    const { nombre, rol, estado } = req.body;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_USER_ID",
        message: "El id del usuario es obligatorio",
      });
    }

    const updates = {};
    if (typeof nombre !== "undefined") updates.nombre = nombre;
    if (typeof rol !== "undefined") updates.rol = rol;
    if (typeof estado !== "undefined") updates.estado = estado;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "NO_UPDATES_PROVIDED",
        message: "No se proporcionaron campos para actualizar",
      });
    }

    const currentAdminId = req.user ? req.user.id : null;

    const usuarioActualizado = await updateUser({
      userId: id,
      updates,
      currentAdminId,
    });

    return res.status(200).json({
      ok: true,
      data: {
        usuario: sanitizeUser(usuarioActualizado),
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
          : err.message || "Error al actualizar el usuario",
    });
  }
}

// Controlador para eliminar un usuario desde un administrador
async function deleteUserByAdmin(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_USER_ID",
        message: "El id del usuario es obligatorio",
      });
    }

    const currentAdminId = req.user ? req.user.id : null;

    const usuarioEliminado = await deleteUser({
      userId: id,
      currentAdminId,
    });

    return res.status(200).json({
      ok: true,
      data: {
        usuario: usuarioEliminado ? sanitizeUser(usuarioEliminado) : null,
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
          : err.message || "Error al eliminar el usuario",
    });
  }
}

module.exports = {
  createUserByAdmin,
  listUsersByAdmin,
  updateUserByAdmin,
  deleteUserByAdmin,
};
