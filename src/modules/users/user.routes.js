const express = require("express");
const { createUserByAdmin } = require("./user.controller");
const { requireAuth, requireRole } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Ruta para crear usuarios, solo accesible para administradores autenticados
router.post("/", requireAuth, requireRole("ADMIN"), createUserByAdmin);

module.exports = router;
