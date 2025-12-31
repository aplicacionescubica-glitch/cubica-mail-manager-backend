const mongoose = require("mongoose");

const InventoryItem = require("./inventory.model");
const StockMove = require("./stockMove.model");
const Warehouse = require("./warehouse.model");

/* Convierte string a ObjectId válido */
function toObjectId(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/* Escapa texto para regex seguro */
function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Obtiene warehouse principal (fallback) */
async function getPrimaryWarehouse({ session } = {}) {
  const q = { active: true, isPrimary: true };
  const w = await Warehouse.findOne(q).session(session || null);
  if (w) return w;

  const any = await Warehouse.findOne({ active: true }).session(session || null);
  return any || null;
}

/* Lista bodegas */
async function listWarehouses({ q, active, limit = 100, sort = "name:asc" } = {}) {
  const filter = {};
  const txt = String(q || "").trim();
  if (txt) {
    const rx = new RegExp(escapeRegex(txt), "i");
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (active === true) filter.active = true;
  if (active === false) filter.active = false;

  const [field, dir] = String(sort || "name:asc").split(":");
  const sortObj = { [field || "name"]: String(dir || "asc").toLowerCase() === "desc" ? -1 : 1 };

  const docs = await Warehouse.find(filter).sort(sortObj).limit(Number(limit) || 100);
  return { items: docs };
}

/* Crea bodega */
async function createWarehouse({ name, code, description, active = true, isPrimary = false, createdBy } = {}) {
  const n = String(name || "").trim();
  if (!n) throw new Error("NAME_REQUIRED");

  const c = String(code || "").trim().toUpperCase();
  if (!c) throw new Error("CODE_REQUIRED");

  const by = createdBy ? toObjectId(createdBy) : null;

  const exists = await Warehouse.findOne({ code: c });
  if (exists) throw new Error("CODE_ALREADY_EXISTS");

  const doc = await Warehouse.create({
    name: n,
    code: c,
    description: description ? String(description).trim() : null,
    active: Boolean(active),
    isPrimary: Boolean(isPrimary),
    createdBy: by,
  });

  return { warehouse: doc };
}

/* Actualiza bodega */
async function updateWarehouse(id, { name, code, description, active, isPrimary, updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("INVALID_WAREHOUSE_ID");

  const doc = await Warehouse.findById(oid);
  if (!doc) throw new Error("WAREHOUSE_NOT_FOUND");

  if (name !== undefined) {
    const n = String(name || "").trim();
    if (!n) throw new Error("NAME_REQUIRED");
    doc.name = n;
  }

  if (code !== undefined) {
    const c = String(code || "").trim().toUpperCase();
    if (!c) throw new Error("CODE_REQUIRED");

    const exists = await Warehouse.findOne({ code: c, _id: { $ne: oid } });
    if (exists) throw new Error("CODE_ALREADY_EXISTS");

    doc.code = c;
  }

  if (description !== undefined) {
    doc.description = description ? String(description).trim() : null;
  }

  if (active !== undefined) doc.active = Boolean(active);
  if (isPrimary !== undefined) doc.isPrimary = Boolean(isPrimary);

  const by = updatedBy ? toObjectId(updatedBy) : null;
  if (by) doc.updatedBy = by;

  await doc.save();
  return { warehouse: doc };
}

/* Desactiva bodega */
async function deactivateWarehouse(id, { updatedBy } = {}) {
  return updateWarehouse(id, { active: false, updatedBy });
}

/* Elimina definitivamente una bodega y reasigna movimientos */
async function purgeWarehouse(id, { reassignToWarehouseId, updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("INVALID_WAREHOUSE_ID");

  const dest = toObjectId(reassignToWarehouseId);
  if (!dest) throw new Error("INVALID_REASSIGN_WAREHOUSE_ID");

  if (String(oid) === String(dest)) throw new Error("SAME_WAREHOUSE_NOT_ALLOWED");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const w = await Warehouse.findById(oid).session(session);
      if (!w) throw new Error("WAREHOUSE_NOT_FOUND");

      const wDest = await Warehouse.findById(dest).session(session);
      if (!wDest) throw new Error("REASSIGN_WAREHOUSE_NOT_FOUND");

      await StockMove.updateMany({ warehouseId: oid }, { $set: { warehouseId: dest } }).session(session);
      await Warehouse.deleteOne({ _id: oid }).session(session);
    });

    return { ok: true };
  } finally {
    session.endSession();
  }
}

/* Crea item de inventario */
async function createItem({ name, category, unit, min_stock, active = true, createdBy } = {}) {
  const n = String(name || "").trim();
  if (!n) throw new Error("NAME_REQUIRED");

  const cat = category ? String(category).trim() : null;
  const u = unit ? String(unit).trim() : null;

  const min = Number(min_stock || 0);
  if (!Number.isFinite(min) || min < 0) throw new Error("INVALID_MIN_STOCK");

  const by = createdBy ? toObjectId(createdBy) : null;

  const doc = await InventoryItem.create({
    name: n,
    category: cat,
    unit: u,
    min_stock: min,
    active: Boolean(active),
    createdBy: by,
  });

  return { item: doc };
}

/* Actualiza item */
async function updateItem(id, { name, category, unit, min_stock, active, updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const doc = await InventoryItem.findById(oid);
  if (!doc) throw new Error("ITEM_NOT_FOUND");

  if (name !== undefined) {
    const n = String(name || "").trim();
    if (!n) throw new Error("NAME_REQUIRED");
    doc.name = n;
  }

  if (category !== undefined) doc.category = category ? String(category).trim() : null;
  if (unit !== undefined) doc.unit = unit ? String(unit).trim() : null;

  if (min_stock !== undefined) {
    const min = Number(min_stock || 0);
    if (!Number.isFinite(min) || min < 0) throw new Error("INVALID_MIN_STOCK");
    doc.min_stock = min;
  }

  if (active !== undefined) doc.active = Boolean(active);

  const by = updatedBy ? toObjectId(updatedBy) : null;
  if (by) doc.updatedBy = by;

  await doc.save();
  return { item: doc };
}

/* Desactiva item */
async function deactivateItem(id, { updatedBy } = {}) {
  return updateItem(id, { active: false, updatedBy });
}

/* Valida que un item no tenga movimientos */
async function assertItemHasNoMoves(itemId) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const has = await StockMove.findOne({ itemId: oid }).select("_id").lean();
  if (has) {
    const err = new Error("ITEM_HAS_MOVES");
    err.code = "ITEM_HAS_MOVES";
    throw err;
  }
}

/* Elimina definitivamente item si no tiene movimientos */
async function purgeItem(itemId) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const doc = await InventoryItem.findById(oid);
  if (!doc) throw new Error("ITEM_NOT_FOUND");

  await assertItemHasNoMoves(oid);
  await InventoryItem.deleteOne({ _id: oid });

  return { ok: true };
}

/* Lista items */
async function listItems({ q, page = 1, limit = 50, active } = {}) {
  const filter = {};
  const txt = String(q || "").trim();
  if (txt) {
    const rx = new RegExp(escapeRegex(txt), "i");
    filter.$or = [{ name: rx }, { category: rx }];
  }
  if (active === true) filter.active = true;
  if (active === false) filter.active = false;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(200, Number(limit) || 50));

  const [items, total] = await Promise.all([
    InventoryItem.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
    InventoryItem.countDocuments(filter),
  ]);

  return {
    items,
    page: p,
    limit: l,
    total,
    pages: Math.max(1, Math.ceil(total / l)),
  };
}

/* Calcula stock por item y bodega */
async function calcStockForItem(itemId, { warehouseId, session } = {}) {
  const oid = toObjectId(itemId);
  if (!oid) return 0;

  const wid = toObjectId(warehouseId);
  if (!wid) return 0;

  const moves = await StockMove.find({ itemId: oid, warehouseId: wid })
    .session(session || null)
    .select("type qty to")
    .lean();

  let stock = 0;
  for (const m of moves) {
    const t = String(m.type || "").toUpperCase();
    if (t === "IN") stock += Number(m.qty || 0);
    if (t === "OUT") stock -= Number(m.qty || 0);
    if (t === "ADJUST") stock = Number(m.to || 0);
  }

  return stock;
}

/* Resumen de stock por bodega */
async function getStockSummary({ q, category, warehouseId } = {}) {
  const wid = toObjectId(warehouseId);
  if (!wid) throw new Error("WAREHOUSE_ID_REQUIRED");

  const filter = { active: true };
  const txt = String(q || "").trim();
  if (txt) {
    const rx = new RegExp(escapeRegex(txt), "i");
    filter.$or = [{ name: rx }, { category: rx }];
  }
  const cat = String(category || "").trim();
  if (cat) filter.category = cat;

  const items = await InventoryItem.find(filter).lean();

  const out = [];
  for (const it of items) {
    const stock = await calcStockForItem(it._id, { warehouseId: wid });
    out.push({ ...it, stock });
  }

  return { items: out };
}

/* Alertas de bajo stock por bodega */
async function getLowStockAlerts({ q, category, warehouseId } = {}) {
  const wid = toObjectId(warehouseId);
  if (!wid) throw new Error("WAREHOUSE_ID_REQUIRED");

  const filter = { active: true };
  const txt = String(q || "").trim();
  if (txt) {
    const rx = new RegExp(escapeRegex(txt), "i");
    filter.$or = [{ name: rx }, { category: rx }];
  }
  const cat = String(category || "").trim();
  if (cat) filter.category = cat;

  const items = await InventoryItem.find(filter).lean();

  const out = [];
  for (const it of items) {
    const stock = await calcStockForItem(it._id, { warehouseId: wid });
    if (Number(stock) <= Number(it.min_stock || 0)) {
      out.push({ ...it, stock });
    }
  }

  return { items: out };
}

/* Registra movimiento IN/OUT */
async function createMove({ itemId, warehouseId, type, qty, note, createdBy, transferId } = {}) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const wid = toObjectId(warehouseId);
  if (!wid) throw new Error("INVALID_WAREHOUSE_ID");

  const t = String(type || "").toUpperCase().trim();
  if (!["IN", "OUT"].includes(t)) throw new Error("INVALID_TYPE");

  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) throw new Error("INVALID_QTY");

  const by = createdBy ? toObjectId(createdBy) : null;
  const xfer = transferId ? String(transferId) : null;

  const session = await mongoose.startSession();
  try {
    let move = null;

    await session.withTransaction(async () => {
      if (t === "OUT") {
        const current = await calcStockForItem(oid, { warehouseId: wid, session });
        if (!Number.isFinite(current)) throw new Error("STOCK_UNAVAILABLE");
        if (current - q < 0) {
          const err = new Error("STOCK_NEGATIVE_NOT_ALLOWED");
          throw err;
        }
      }

      const moveDoc = await StockMove.create(
        [
          {
            itemId: oid,
            warehouseId: wid,
            type: t,
            qty: q,
            note: note || null,
            transferId: xfer,
            createdBy: by,
          },
        ],
        { session }
      );

      move = moveDoc[0].toObject();
    });

    return { move };
  } finally {
    session.endSession();
  }
}

/* Registra movimiento ADJUST a stock final */
async function createAdjustMoveSet({ itemId, warehouseId, to, note, createdBy } = {}) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const wid = toObjectId(warehouseId);
  if (!wid) throw new Error("INVALID_WAREHOUSE_ID");

  const target = Number(to);
  if (!Number.isFinite(target) || target < 0) throw new Error("INVALID_TO");

  const by = createdBy ? toObjectId(createdBy) : null;

  const session = await mongoose.startSession();
  try {
    let move = null;

    await session.withTransaction(async () => {
      const current = await calcStockForItem(oid, { warehouseId: wid, session });
      const delta = target - current;

      const created = await StockMove.create(
        [
          {
            itemId: oid,
            warehouseId: wid,
            type: "ADJUST",
            qty: delta,
            to: target,
            note: note || null,
            createdBy: by,
          },
        ],
        { session }
      );

      move = created[0].toObject();
    });

    return { move };
  } finally {
    session.endSession();
  }
}

/* Transferencia entre bodegas */
async function transferStock({ itemId, fromWarehouseId, toWarehouseId, qty, note, createdBy }) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const fromWid = toObjectId(fromWarehouseId);
  if (!fromWid) throw new Error("INVALID_FROM_WAREHOUSE_ID");

  const toWid = toObjectId(toWarehouseId);
  if (!toWid) throw new Error("INVALID_TO_WAREHOUSE_ID");

  if (String(fromWid) === String(toWid)) throw new Error("SAME_WAREHOUSE_NOT_ALLOWED");

  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) throw new Error("INVALID_QTY");

  const by = createdBy ? toObjectId(createdBy) : null;
  const transferId = new mongoose.Types.ObjectId().toString();

  const session = await mongoose.startSession();
  try {
    let outMove = null;
    let inMove = null;

    await session.withTransaction(async () => {
      const current = await calcStockForItem(oid, { warehouseId: fromWid, session });
      if (!Number.isFinite(current)) throw new Error("STOCK_UNAVAILABLE");
      if (current - q < 0) {
        const err = new Error("STOCK_NEGATIVE_NOT_ALLOWED");
        throw err;
      }

      const created = await StockMove.create(
        [
          {
            itemId: oid,
            warehouseId: fromWid,
            type: "OUT",
            qty: q,
            note: note || null,
            transferId,
            createdBy: by,
          },
          {
            itemId: oid,
            warehouseId: toWid,
            type: "IN",
            qty: q,
            note: note || null,
            transferId,
            createdBy: by,
          },
        ],
        { session, ordered: true }
      );

      outMove = created[0].toObject();
      inMove = created[1].toObject();
    });

    return { transferId, outMove, inMove };
  } finally {
    session.endSession();
  }
}

/* Lista movimientos (opcional por bodega) */
async function listMoves({ warehouseId, page = 1, limit = 50 } = {}) {
  const filter = {};
  const wid = toObjectId(warehouseId);
  if (wid) filter.warehouseId = wid;

  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Math.min(200, Number(limit) || 50));

  const [items, total] = await Promise.all([
    StockMove.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
    StockMove.countDocuments(filter),
  ]);

  return {
    items,
    page: p,
    limit: l,
    total,
    pages: Math.max(1, Math.ceil(total / l)),
  };
}

module.exports = {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deactivateWarehouse,
  purgeWarehouse,

  createItem,
  updateItem,
  deactivateItem,
  purgeItem,
  listItems,

  getPrimaryWarehouse,
  calcStockForItem,
  getStockSummary,
  getLowStockAlerts,

  createMove,
  createAdjustMoveSet,
  transferStock,
  listMoves,
};
