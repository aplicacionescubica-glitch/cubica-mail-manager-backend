const express = require("express");
const router = express.Router();

const { listEmailHistory } = require("./emailLog.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");

/* Rutas de historial de correos */
router.get("/history", requireAuth, listEmailHistory);

module.exports = router;
