const jwt = require("jsonwebtoken");

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;

if (!ACCESS_TOKEN_SECRET) {
  throw new Error("[AuthMiddleware] Falta la variable JWT_ACCESS_SECRET");
}

// Extrae el token de acceso desde el encabezado Authorization tipo Bearer
function extractTokenFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2) return null;

  const [scheme, token] = parts;
  if (!/^Bearer$/i.test(scheme)) return null;

  return token;
}

// Middleware que exige un token válido y añade los datos del usuario a req.user
function requireAuth(req, res, next) {
  try {
    const token = extractTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "AUTH_REQUIRED",
        message: "Autenticación requerida",
      });
    }

    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);

    req.user = {
      id: payload.sub,
      email: payload.email,
      rol: payload.rol,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      error: "INVALID_TOKEN",
      message: "Token inválido o expirado",
    });
  }
}

// Middleware que exige que el usuario autenticado tenga un rol específico
function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "AUTH_REQUIRED",
        message: "Autenticación requerida",
      });
    }

    if (req.user.rol !== requiredRole) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: "No tienes permisos para realizar esta acción",
      });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
