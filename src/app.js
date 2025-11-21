require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

// Config global
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// Middlewares base
app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

// Ruta de prueba
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "cubica-mail-manager-backend",
    env: process.env.NODE_ENV || "development",
  });
});

module.exports = app;
