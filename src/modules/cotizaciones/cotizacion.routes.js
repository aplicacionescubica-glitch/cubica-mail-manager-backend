const express = require("express");
const {
  listarCotizaciones,
  marcarEnGestion,
  marcarRespondida,
  marcarVencida,
  notificarCotizacionesPendientes,
  sincronizarCotizacionesDesdeGmail,
  responderCotizacion,
} = require("./cotizacion.controller");
const {
  requireAuth,
  requireRole,
  requireCronSecret,
} = require("../../middlewares/auth.middleware");

const router = express.Router();

/* Rutas para tareas automáticas (cron) */
// Estas rutas se usan solo desde GitHub Actions u otro scheduler externo
router.post(
  "/sync-email/cron",
  requireCronSecret,
  sincronizarCotizacionesDesdeGmail
);

router.post(
  "/notificar-pendientes/cron",
  requireCronSecret,
  notificarCotizacionesPendientes
);

/* Rutas de administración protegidas por JWT y rol ADMIN */
// Sincroniza correos de Gmail como cotizaciones (solo ADMIN)
router.post(
  "/sync-email",
  requireAuth,
  requireRole("ADMIN"),
  sincronizarCotizacionesDesdeGmail
);

// Notifica por correo las cotizaciones atrasadas (solo ADMIN)
router.post(
  "/notificar-pendientes",
  requireAuth,
  requireRole("ADMIN"),
  notificarCotizacionesPendientes
);

/* Rutas de gestión de cotizaciones para usuarios autenticados */
// Lista cotizaciones con filtros y orden por antigüedad
router.get("/", requireAuth, listarCotizaciones);

// Marca una cotización como EN_GESTION
router.patch("/:id/en-gestion", requireAuth, marcarEnGestion);

// Envía respuesta a una cotización y actualiza su estado
router.post("/:id/responder", requireAuth, responderCotizacion);

// Marca una cotización como RESPONDIDA (solo estado)
router.patch("/:id/respondida", requireAuth, marcarRespondida);

// Marca una cotización como VENCIDA
router.patch("/:id/vencida", requireAuth, marcarVencida);

module.exports = router;
