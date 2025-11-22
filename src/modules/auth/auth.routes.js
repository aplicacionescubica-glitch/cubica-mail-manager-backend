const express = require("express");
const { login, me, verifyEmail } = require("./auth.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Ruta de inicio de sesión con email y contraseña
router.post("/login", login);

// Ruta para obtener los datos del usuario autenticado
router.get("/me", requireAuth, me);

// Ruta para verificar el correo a partir de un token
router.post("/verify-email", verifyEmail);

module.exports = router;
