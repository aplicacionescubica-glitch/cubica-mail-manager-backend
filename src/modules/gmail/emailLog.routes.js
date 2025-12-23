const express = require("express");
const router = express.Router();

const { listEmailHistory } = require("./emailLog.controller");

// Import robusto del middleware (soporta export directo o { authMiddleware })
const auth = require("../../middlewares/auth.middleware");
const authMiddleware = auth && typeof auth === "function" ? auth : auth?.authMiddleware;

/* Rutas de historial de correos */
router.get("/history", authMiddleware, listEmailHistory);

module.exports = router;
