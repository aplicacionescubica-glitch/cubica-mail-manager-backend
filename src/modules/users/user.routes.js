const express = require("express");
const {
  createUserByAdmin,
  listUsersByAdmin,
  updateUserByAdmin,
} = require("./user.controller");
const { requireAuth, requireRole } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Ruta para listar usuarios, solo accesible para administradores autenticados
router.get("/", requireAuth, requireRole("ADMIN"), listUsersByAdmin);

// Ruta para crear usuarios, solo accesible para administradores autenticados
router.post("/", requireAuth, requireRole("ADMIN"), createUserByAdmin);

// Ruta para actualizar usuarios, solo accesible para administradores autenticados
router.patch("/:id", requireAuth, requireRole("ADMIN"), updateUserByAdmin);

module.exports = router;
