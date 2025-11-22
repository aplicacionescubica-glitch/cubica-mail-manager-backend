const express = require("express");
const {
  listarCotizaciones,
  marcarEnGestion,
  marcarRespondida,
  marcarVencida,
  notificarCotizacionesPendientes,
  sincronizarCotizacionesDesdeGmail,
} = require("./cotizacion.controller");
const { requireAuth, requireRole } = require("../../middlewares/auth.middleware");

const router = express.Router();

// Sincroniza correos de Gmail como cotizaciones (solo ADMIN)
// Pensado para ser llamado desde Postman o un cron externo autenticado
router.post(
  "/sync-email",
  requireAuth,
  requireRole("ADMIN"),
  sincronizarCotizacionesDesdeGmail
);

// Notifica por correo las cotizaciones atrasadas (RF-11), solo ADMIN
router.post(
  "/notificar-pendientes",
  requireAuth,
  requireRole("ADMIN"),
  notificarCotizacionesPendientes
);

// Lista cotizaciones con filtros y orden por antigüedad
router.get("/", requireAuth, listarCotizaciones);

// Marca una cotización como EN_GESTION
router.patch("/:id/en-gestion", requireAuth, marcarEnGestion);

// Marca una cotización como RESPONDIDA
router.patch("/:id/respondida", requireAuth, marcarRespondida);

// Marca una cotización como VENCIDA
router.patch("/:id/vencida", requireAuth, marcarVencida);

module.exports = router;
