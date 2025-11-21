const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[cubica-mail-manager-backend] Servidor escuchando en puerto ${PORT}`);
  });
}

start();
