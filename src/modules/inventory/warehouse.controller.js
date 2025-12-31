const mongoose = require("mongoose");

const Warehouse = require("./warehouse.model");
const StockMove = require("./stockMove.model");

const warehouseService = require("./warehouse.service");

/* Helpers de parseo y validación */
function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function toObjectId(id) {
  const s = String(id || "").trim();
  if (!s) return null;
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function badRequest(res, error, message) {
  return res.status(400).json({ ok: false, error, message });
}

function serverError(res, err) {
  console.error("[WarehouseController] Error:", err?.message || err);
  return res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    message: "Error interno del servidor",
  });
}

/* Lista bodegas con filtros y paginación */
async function listWarehouses(req, res) {
  try {
    const q = String(req.query.q || "").trim() || null;
    const active = toBool(req.query.active, null);
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit, 50)));
    const sort = String(req.query.sort || "name:asc").trim();

    const result = await warehouseService.listWarehouses({
      q,
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

/* Obtiene bodega por id */
async function getWarehouse(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id de la bodega es requerido");
    }

    const doc = await warehouseService.getWarehouseById(id);
    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Bodega no existe",
      });
    }

    return res.json({ ok: true, data: doc });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Crea bodega (admin) */
async function createWarehouse(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const code = String(req.body?.code || "").trim().toUpperCase();
    const description = req.body?.description === undefined ? null : String(req.body.description || "").trim() || null;
    const active = toBool(req.body?.active, true);

    if (!name) {
      return badRequest(res, "VALIDATION_ERROR", "El nombre es requerido");
    }
    if (!code) {
      return badRequest(res, "VALIDATION_ERROR", "El code es requerido");
    }

    const createdBy = req.user?.id || null;

    const created = await warehouseService.createWarehouse({
      name,
      code,
      description,
      active,
      createdBy,
    });

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    if (String(err?.code) === "11000") {
      return badRequest(res, "DUPLICATE", "Ya existe una bodega con ese code");
    }
    return serverError(res, err);
  }
}

/* Actualiza bodega (admin) */
async function updateWarehouse(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id de la bodega es requerido");
    }

    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name || "").trim();
    if (req.body?.code !== undefined) patch.code = String(req.body.code || "").trim().toUpperCase();
    if (req.body?.description !== undefined) {
      patch.description = String(req.body.description || "").trim() || null;
    }
    if (req.body?.active !== undefined) patch.active = toBool(req.body.active, null);

    if (patch.name !== undefined && !patch.name) {
      return badRequest(res, "VALIDATION_ERROR", "El nombre no puede ser vacío");
    }
    if (patch.code !== undefined && !patch.code) {
      return badRequest(res, "VALIDATION_ERROR", "El code no puede ser vacío");
    }
    if (patch.active === null) delete patch.active;

    const updatedBy = req.user?.id || null;

    const updated = await warehouseService.updateWarehouse(id, patch, { updatedBy });
    if (!updated) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Bodega no existe",
      });
    }

    return res.json({ ok: true, data: updated });
  } catch (err) {
    if (String(err?.code) === "11000") {
      return badRequest(res, "DUPLICATE", "Ya existe una bodega con ese code");
    }
    return serverError(res, err);
  }
}

/* Desactiva bodega (admin) */
async function deactivateWarehouse(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id de la bodega es requerido");
    }

    const updatedBy = req.user?.id || null;

    const ok = await warehouseService.deactivateWarehouse(id, { updatedBy });
    if (!ok) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Bodega no existe",
      });
    }

    return res.json({ ok: true, message: "Bodega desactivada" });
  } catch (err) {
    return serverError(res, err);
  }
}

/* Elimina bodega físicamente y reasigna movimientos a otra bodega (admin) */
async function purgeWarehouse(req, res) {
  const session = await mongoose.startSession();

  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return badRequest(res, "VALIDATION_ERROR", "El id de la bodega es requerido");
    }

    const warehouseId = toObjectId(id);
    if (!warehouseId) {
      return badRequest(res, "VALIDATION_ERROR", "El id de la bodega no es válido");
    }

    const targetInput =
      String(req.body?.targetWarehouseId || "").trim() ||
      String(req.query?.targetWarehouseId || "").trim() ||
      "";

    const targetWarehouseId = targetInput ? toObjectId(targetInput) : null;
    if (targetInput && !targetWarehouseId) {
      return badRequest(res, "VALIDATION_ERROR", "El targetWarehouseId no es válido");
    }

    if (targetWarehouseId && String(targetWarehouseId) === String(warehouseId)) {
      return badRequest(res, "VALIDATION_ERROR", "La bodega destino no puede ser la misma");
    }

    await session.withTransaction(async () => {
      /* Valida bodega a eliminar */
      const toDelete = await Warehouse.findById(warehouseId).session(session);
      if (!toDelete) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }

      /* Elige bodega destino */
      let target = null;

      if (targetWarehouseId) {
        target = await Warehouse.findOne({ _id: targetWarehouseId, active: true }).session(session);
        if (!target) {
          throw Object.assign(new Error("TARGET_NOT_FOUND"), { code: "TARGET_NOT_FOUND" });
        }
      } else {
        target = await Warehouse.findOne({
          _id: { $ne: warehouseId },
          active: true,
          code: { $in: ["PRINCIPAL", "BODEGA_PRINCIPAL", "BODEGA_1"] },
        })
          .sort({ code: 1, name: 1 })
          .session(session);

        if (!target) {
          target = await Warehouse.findOne({ _id: { $ne: warehouseId }, active: true })
            .sort({ name: 1 })
            .session(session);
        }

        if (!target) {
          throw Object.assign(new Error("NO_TARGET"), { code: "NO_TARGET" });
        }
      }

      /* Reasigna movimientos (histórico) a bodega destino */
      await StockMove.updateMany(
        { warehouseId },
        { $set: { warehouseId: target._id } },
        { session }
      );

      /* Elimina físicamente la bodega */
      await Warehouse.deleteOne({ _id: warehouseId }).session(session);
    });

    session.endSession();

    return res.json({
      ok: true,
      message: "Bodega eliminada y movimientos reasignados",
    });
  } catch (err) {
    session.endSession();

    if (err?.code === "NOT_FOUND") {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
        message: "Bodega no existe",
      });
    }

    if (err?.code === "TARGET_NOT_FOUND") {
      return badRequest(res, "TARGET_NOT_FOUND", "La bodega destino no existe o está inactiva");
    }

    if (err?.code === "NO_TARGET") {
      return badRequest(
        res,
        "NO_TARGET_WAREHOUSE",
        "No hay una bodega destino disponible para reasignar movimientos"
      );
    }

    return serverError(res, err);
  }
}

module.exports = {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deactivateWarehouse,
  purgeWarehouse,
};
