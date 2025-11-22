const express = require("express");
const {
  listarCotizaciones,
  marcarEnGestion,
  marcarRespondida,
  marcarVencida,
} = require("./cotizacion.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Lista cotizaciones con filtros y orden por antigüedad
router.get("/", requireAuth, listarCotizaciones);

// Marca una cotización como EN_GESTION
router.patch("/:id/en-gestion", requireAuth, marcarEnGestion);

// Marca una cotización como RESPONDIDA
router.patch("/:id/respondida", requireAuth, marcarRespondida);

// Marca una cotización como VENCIDA
router.patch("/:id/vencida", requireAuth, marcarVencida);

module.exports = router;
