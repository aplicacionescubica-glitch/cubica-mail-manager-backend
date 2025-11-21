const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("[MongoDB] Falta la variable de entorno MONGODB_URI");
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("[MongoDB] Conexión exitosa");
  } catch (err) {
    console.error("[MongoDB] Error de conexión:", err.message);
    process.exit(1); 
  }
}

module.exports = { connectDB };
