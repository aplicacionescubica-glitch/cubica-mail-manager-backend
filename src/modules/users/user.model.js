const mongoose = require("mongoose");

// Esquema de usuario con datos básicos y seguridad
const userSchema = new mongoose.Schema(
  {
    // Datos principales de identificación
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },

    // Seguridad y control de acceso
    passwordHash: {
      type: String,
      required: true,
    },
    rol: {
      type: String,
      required: true,
      enum: ["ADMIN", "AGENTE"],
    },
    estado: {
      type: String,
      required: true,
      enum: ["activo", "bloqueado", "pendiente_email"],
      default: "pendiente_email",
    },
    emailVerificado: {
      type: Boolean,
      default: false,
    },

    // Control de intentos fallidos y bloqueo temporal
    intentosLoginFallidos: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },

    // Datos de auditoría del usuario
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Token de verificación de correo en el mismo documento
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Índice único para asegurar emails sin duplicados
userSchema.index({ email: 1 }, { unique: true });

// Modelo de usuario para usar en el resto de módulos
const Usuario = mongoose.model("Usuario", userSchema);

module.exports = Usuario;
