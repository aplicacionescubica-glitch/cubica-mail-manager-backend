const express = require("express");
const router = express.Router();

const { listEmailHistory } = require("./emailLog.controller");
const authMiddleware = require("../../middlewares/authMiddleware");

/* Rutas de historial de correos */
router.get("/history", authMiddleware, listEmailHistory);

module.exports = router;
