const express = require("express");

const { requireAuth, requireRole } = require("../../middlewares/auth.middleware");

const inventoryController = require("./inventory.controller");

const router = express.Router();

/* Protege todas las rutas del módulo */
router.use(requireAuth);

/* Items: lectura */
router.get("/items", inventoryController.listItems);
router.get("/items/:id", inventoryController.getItem);

/* Items: mutación (solo admin) */
router.post("/items", requireRole("ADMIN"), inventoryController.createItem);
router.put("/items/:id", requireRole("ADMIN"), inventoryController.updateItem);

/* Items: desactivar (soft delete) */
router.delete("/items/:id", requireRole("ADMIN"), inventoryController.deactivateItem);

/* Items: eliminar definitivamente condicionado (solo si no tiene movimientos) */
router.delete("/items/:id/purge", requireRole("ADMIN"), inventoryController.purgeItem);

/* Stock: lectura */
router.get("/stock", inventoryController.getStockSummary);

/* Movimientos: lectura */
router.get("/moves", inventoryController.listMoves);

/* Movimientos: mutación (solo admin) */
router.post("/moves", requireRole("ADMIN"), inventoryController.createMove);

/* Transferencias entre bodegas: mutación (solo admin) */
router.post("/transfers", requireRole("ADMIN"), inventoryController.createTransfer);

/* Alertas: lectura */
router.get("/alerts/low-stock", inventoryController.getLowStockAlerts);

module.exports = router;
