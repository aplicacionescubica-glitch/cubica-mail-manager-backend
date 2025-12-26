const express = require("express");

const {
  requireAuth,
  requireRole,
} = require("../../middlewares/auth.middleware");

const inventoryController = require("./inventory.controller");

const router = express.Router();

/* Protege todas las rutas del módulo */
router.use(requireAuth);

/* Items: lectura */
router.get("/items", inventoryController.listItems);
router.get("/items/:id", inventoryController.getItem);

/* Items: mutaciones (solo admin) */
router.post("/items", requireRole("ADMIN"), inventoryController.createItem);
router.put("/items/:id", requireRole("ADMIN"), inventoryController.updateItem);
router.delete("/items/:id", requireRole("ADMIN"), inventoryController.deactivateItem);

/* Stock: lectura */
router.get("/stock", inventoryController.getStockSummary);

/* Movimientos: lectura */
router.get("/moves", inventoryController.listMoves);

/* Movimientos: mutación (solo admin) */
router.post("/moves", requireRole("ADMIN"), inventoryController.createMove);

/* Alertas: lectura */
router.get("/alerts/low-stock", inventoryController.getLowStockAlerts);

module.exports = router;
