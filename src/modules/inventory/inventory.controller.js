const inventoryService = require("./inventory.service");

const MOVE_TYPES = new Set(["IN", "OUT", "ADJUST"]);

/* Helpers de parseo y validación */
function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNumber(value, fallback) {
  const n = Number(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function badRequest(res, error, message) {
  return res.status(400).json({ ok: false, error, message });
}

function serverError(res, err) {
  console.error("[InventoryController] Error:", err?.message || err);
  return res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    message: "Error interno del servidor",
  });
}

/* Items: lista con filtros y paginación */
async function listItems(req, res) {
  try {
    const q = String(req.query.q || "").trim() || null;
    const category = String(req.query.category || "").trim() || null;
    const active = toBool(req.query.active, null);
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit, 50)));
    const sort = String(req.query.sort || "name:asc").trim();

    const result = await inventoryService.listItems({
      q,
      category,
      active,
      page,
      limit,
      sort,
    });

    return res.json({ ok: true, data: result });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Items: obtiene un item por id */
async function getItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id del item es requerido");
    }

    const item = await inventoryService.getItemById(id);
    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Item no existe",
      });
    }

    return res.json({ ok: true, data: item });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Items: crea un item */
async function createItem(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const category = String(req.body?.category || "").trim() || null;
    const unit = String(req.body?.unit || "").trim() || null;
    const min_stock = toNumber(req.body?.min_stock, 0);
    const active = toBool(req.body?.active, true);

    if (!name) {
      return badRequest(res, "VALIDATION_ERROR", "El nombre es requerido");
    }
    if (!Number.isFinite(min_stock) || min_stock < 0) {
      return badRequest(res, "VALIDATION_ERROR", "min_stock debe ser un número >= 0");
    }

    const createdBy = req.user?.id || null;

    const created = await inventoryService.createItem({
      name,
      category,
      unit,
      min_stock,
      active,
      createdBy,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Items: actualiza un item */
async function updateItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id del item es requerido");
    }

    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name || "").trim();
    if (req.body?.category !== undefined) patch.category = String(req.body.category || "").trim() || null;
    if (req.body?.unit !== undefined) patch.unit = String(req.body.unit || "").trim() || null;
    if (req.body?.min_stock !== undefined) patch.min_stock = toNumber(req.body.min_stock, NaN);
    if (req.body?.active !== undefined) patch.active = toBool(req.body.active, null);

    if (patch.name !== undefined && !patch.name) {
      return badRequest(res, "VALIDATION_ERROR", "El nombre no puede ser vacío");
    }
    if (patch.min_stock !== undefined) {
      if (!Number.isFinite(patch.min_stock) || patch.min_stock < 0) {
        return badRequest(res, "VALIDATION_ERROR", "min_stock debe ser un número >= 0");
      }
    }
    if (patch.active === null) delete patch.active;

    const updatedBy = req.user?.id || null;

    const updated = await inventoryService.updateItem(id, patch, { updatedBy });
    if (!updated) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Item no existe",
      });
    }

    return res.json({ ok: true, data: updated });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Items: desactiva (soft delete) un item */
async function deactivateItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id del item es requerido");
    }

    const updatedBy = req.user?.id || null;

    const ok = await inventoryService.deactivateItem(id, { updatedBy });
    if (!ok) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Item no existe",
      });
    }

    return res.json({ ok: true, message: "Item desactivado" });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Stock: resumen del stock actual por item (opcional por bodega) */
async function getStockSummary(req, res) {
  try {
    const q = String(req.query.q || "").trim() || null;
    const category = String(req.query.category || "").trim() || null;
    const active = toBool(req.query.active, null);
    const warehouseId = String(req.query.warehouseId || "").trim() || null;

    const result = await inventoryService.getStockSummary({
      q,
      category,
      active,
      warehouseId,
    });

    return res.json({ ok: true, data: result });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Movimientos: lista con filtros y paginación (opcional por bodega) */
async function listMoves(req, res) {
  try {
    const itemId = String(req.query.itemId || "").trim() || null;
    const warehouseId = String(req.query.warehouseId || "").trim() || null;
    const transferId = String(req.query.transferId || "").trim() || null;

    const type = String(req.query.type || "").trim().toUpperCase() || null;
    const from = toDateOrNull(req.query.from);
    const to = toDateOrNull(req.query.to);

    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit, 50)));
    const sort = String(req.query.sort || "createdAt:desc").trim();

    if (type && !MOVE_TYPES.has(type)) {
      return badRequest(res, "VALIDATION_ERROR", "type inválido");
    }

    const result = await inventoryService.listMoves({
      itemId,
      warehouseId,
      transferId,
      type,
      from,
      to,
      page,
      limit,
      sort,
    });

    return res.json({ ok: true, data: result });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Movimientos: crea IN/OUT o ADJUST (set) por bodega con bloqueo de stock negativo */
async function createMove(req, res) {
  try {
    const itemId = String(req.body?.itemId || "").trim();
    const warehouseId = String(req.body?.warehouseId || "").trim();
    const type = String(req.body?.type || "").trim().toUpperCase();
    const note = req.body?.note === undefined ? null : String(req.body.note || "").trim() || null;

    if (!itemId) {
      return badRequest(res, "VALIDATION_ERROR", "itemId es requerido");
    }
    if (!warehouseId) {
      return badRequest(res, "VALIDATION_ERROR", "warehouseId es requerido");
    }
    if (!MOVE_TYPES.has(type)) {
      return badRequest(res, "VALIDATION_ERROR", "type debe ser IN, OUT o ADJUST");
    }

    const createdBy = req.user?.id || null;

    if (type === "ADJUST") {
      const toStock = toNumber(req.body?.to, NaN);

      if (!Number.isFinite(toStock) || toStock < 0) {
        return badRequest(res, "VALIDATION_ERROR", "to debe ser un número >= 0");
      }

      const created = await inventoryService.createAdjustMoveSet({
        itemId,
        warehouseId,
        to: toStock,
        note,
        createdBy,
      });

      return res.status(201).json({ ok: true, data: created });
    }

    const qty = toNumber(req.body?.qty, NaN);
    if (!Number.isFinite(qty) || qty <= 0) {
      return badRequest(res, "VALIDATION_ERROR", "qty debe ser un número > 0");
    }

    if (type === "OUT") {
      const current = await inventoryService.getStockForItem(itemId, { warehouseId });
      if (!Number.isFinite(current)) {
        return badRequest(res, "STOCK_UNAVAILABLE", "No fue posible calcular el stock actual del item");
      }
      if (current - qty < 0) {
        return badRequest(res, "STOCK_NEGATIVE_NOT_ALLOWED", "La salida dejaría el stock en negativo");
      }
    }

    const created = await inventoryService.createMove({
      itemId,
      warehouseId,
      type,
      qty,
      note,
      createdBy,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    if (err?.message === "STOCK_NEGATIVE_NOT_ALLOWED") {
      return badRequest(res, "STOCK_NEGATIVE_NOT_ALLOWED", "La salida dejaría el stock en negativo");
    }
    if (err?.message === "INVALID_WAREHOUSE_ID") {
      return badRequest(res, "VALIDATION_ERROR", "warehouseId inválido");
    }
    if (err?.message === "INVALID_ITEM_ID") {
      return badRequest(res, "VALIDATION_ERROR", "itemId inválido");
    }
    return serverError(res, err);
  }
}

/* Transferencias: mueve stock entre bodegas (OUT origen + IN destino) */
async function createTransfer(req, res) {
  try {
    const itemId = String(req.body?.itemId || "").trim();
    const fromWarehouseId = String(req.body?.fromWarehouseId || "").trim();
    const toWarehouseId = String(req.body?.toWarehouseId || "").trim();
    const note = req.body?.note === undefined ? null : String(req.body.note || "").trim() || null;

    if (!itemId) {
      return badRequest(res, "VALIDATION_ERROR", "itemId es requerido");
    }
    if (!fromWarehouseId) {
      return badRequest(res, "VALIDATION_ERROR", "fromWarehouseId es requerido");
    }
    if (!toWarehouseId) {
      return badRequest(res, "VALIDATION_ERROR", "toWarehouseId es requerido");
    }

    const qty = toNumber(req.body?.qty, NaN);
    if (!Number.isFinite(qty) || qty <= 0) {
      return badRequest(res, "VALIDATION_ERROR", "qty debe ser un número > 0");
    }

    const createdBy = req.user?.id || null;

    const result = await inventoryService.transferStock({
      itemId,
      fromWarehouseId,
      toWarehouseId,
      qty,
      note,
      createdBy,
    });

    return res.status(201).json({ ok: true, data: result });
  } catch (err) {
    if (err?.message === "STOCK_NEGATIVE_NOT_ALLOWED") {
      return badRequest(res, "STOCK_NEGATIVE_NOT_ALLOWED", "La transferencia dejaría el stock en negativo");
    }
    if (err?.message === "SAME_WAREHOUSE_NOT_ALLOWED") {
      return badRequest(res, "VALIDATION_ERROR", "La bodega origen y destino no pueden ser iguales");
    }
    if (err?.message === "INVALID_FROM_WAREHOUSE_ID") {
      return badRequest(res, "VALIDATION_ERROR", "fromWarehouseId inválido");
    }
    if (err?.message === "INVALID_TO_WAREHOUSE_ID") {
      return badRequest(res, "VALIDATION_ERROR", "toWarehouseId inválido");
    }
    if (err?.message === "INVALID_ITEM_ID") {
      return badRequest(res, "VALIDATION_ERROR", "itemId inválido");
    }
    return serverError(res, err);
  }
}

/* Alertas: items con stock <= min_stock (opcional por bodega) */
async function getLowStockAlerts(req, res) {
  try {
    const q = String(req.query.q || "").trim() || null;
    const category = String(req.query.category || "").trim() || null;
    const warehouseId = String(req.query.warehouseId || "").trim() || null;

    const result = await inventoryService.getLowStockAlerts({
      q,
      category,
      warehouseId,
    });

    return res.json({ ok: true, data: result });
  } catch (err) {
    return serverError(res, err);
  }
}

module.exports = {
  listItems,
  getItem,
  createItem,
  updateItem,
  deactivateItem,
  getStockSummary,
  listMoves,
  createMove,
  createTransfer,
  getLowStockAlerts,
};
