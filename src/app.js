// Carga de variables de entorno
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Rutas de autenticación
const authRoutes = require("./modules/auth/auth.routes");

// Rutas de usuarios
const userRoutes = require("./modules/users/user.routes");

// Rutas de cotizaciones
const cotizacionRoutes = require("./modules/cotizaciones/cotizacion.routes");

const app = express();

// Configuración de CORS
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// Middlewares de seguridad y parseo de JSON
app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

// Ruta de verificación del estado del backend
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "cubica-mail-manager-backend",
    env: process.env.NODE_ENV || "development",
  });
});

// Rutas de autenticación
app.use("/api/auth", authRoutes);

// Rutas de usuarios (solo para administradores autenticados)
app.use("/api/users", userRoutes);

// Rutas de cotizaciones
app.use("/api/cotizaciones", cotizacionRoutes);

module.exports = app;
