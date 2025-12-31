const express = require("express");

const { requireAuth, requireRole } = require("../../middlewares/auth.middleware");

const warehouseController = require("./warehouse.controller");

const router = express.Router();

/* Protege todas las rutas del módulo */
router.use(requireAuth);

/* Lectura */
router.get("/", warehouseController.listWarehouses);
router.get("/:id", warehouseController.getWarehouse);

/* Mutaciones (solo admin) */
router.post("/", requireRole("ADMIN"), warehouseController.createWarehouse);
router.put("/:id", requireRole("ADMIN"), warehouseController.updateWarehouse);

/* Eliminar físico (purge) con reasignación de movimientos a bodega destino */
router.delete("/:id/purge", requireRole("ADMIN"), warehouseController.purgeWarehouse);

/* Eliminar lógico (soft delete) */
router.delete("/:id", requireRole("ADMIN"), warehouseController.deactivateWarehouse);

module.exports = router;
