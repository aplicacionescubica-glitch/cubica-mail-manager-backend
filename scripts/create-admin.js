// Carga de variables de entorno
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { connectDB } = require("../src/config/db");
const Usuario = require("../src/modules/users/user.model");

// Lee los argumentos de la línea de comandos
const [,, emailArg, nombreArg, passwordArg] = process.argv;

// Valida que se hayan pasado email, nombre y contraseña
function validateArgs() {
  if (!emailArg || !nombreArg || !passwordArg) {
    console.error("Uso: node scripts/create-admin.js <email> <nombre> <password>");
    process.exit(1);
  }
}

// Crea el hash seguro de la contraseña
async function hashPassword(plainPassword) {
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
}

// Crea el usuario administrador inicial si no existe
async function createInitialAdmin() {
  await connectDB();

  validateArgs();

  const email = emailArg.toLowerCase().trim();
  const nombre = nombreArg.trim();
  const password = passwordArg;

  const existing = await Usuario.findOne({ email });

  if (existing) {
    console.error(`Ya existe un usuario con el email: ${email}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const admin = new Usuario({
    email,
    nombre,
    rol: "ADMIN",
    passwordHash,
    estado: "activo",
    emailVerificado: true,
    intentosLoginFallidos: 0,
    lockedUntil: null,
    createdBy: null,
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
  });

  await admin.save();

  console.log("Usuario administrador creado correctamente:");
  console.log(`ID: ${admin._id.toString()}`);
  console.log(`Email: ${admin.email}`);
  console.log(`Nombre: ${admin.nombre}`);
  console.log(`Rol: ${admin.rol}`);

  process.exit(0);
}

// Ejecuta el flujo principal del script
createInitialAdmin().catch((err) => {
  console.error("Error al crear el usuario administrador:", err.message);
  process.exit(1);
});


//node scripts/create-admin.js admin@empresa.com "Admin General" MiClaveSegura123