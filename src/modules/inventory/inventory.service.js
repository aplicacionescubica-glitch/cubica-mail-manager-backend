const mongoose = require("mongoose");

const InventoryItem = require("./inventory.model");
const StockMove = require("./stockMove.model");

const MOVE_TYPES = new Set(["IN", "OUT", "ADJUST"]);
const SORT_FIELDS_ITEMS = new Set(["name", "category", "min_stock", "active", "createdAt", "updatedAt"]);
const SORT_FIELDS_MOVES = new Set(["createdAt", "type", "qty"]);

/* Escapa texto para regex seguro */
function escapeRegex(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Convierte a ObjectId si es válido */
function toObjectId(id) {
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

/* Parsea sort tipo "name:asc" */
function parseSort(sortStr, allowedFields, fallback) {
  const s = String(sortStr || "").trim();
  if (!s) return fallback;

  const [fieldRaw, dirRaw] = s.split(":").map((p) => String(p || "").trim());
  const field = fieldRaw || "";
  const dir = (dirRaw || "asc").toLowerCase();

  if (!allowedFields.has(field)) return fallback;
  const order = dir === "desc" ? -1 : 1;

  return { [field]: order };
}

/* Construye filtro de items */
function buildItemsFilter({ q, category, active }) {
  const filter = {};

  if (active === true || active === false) filter.active = active;
  if (category) filter.category = String(category).trim();

  if (q) {
    const rx = new RegExp(escapeRegex(String(q).trim()), "i");
    filter.$or = [{ name: rx }, { category: rx }];
  }

  return filter;
}

/* Construye match base para movimientos */
function buildMovesMatch({ itemId, itemIds, warehouseId }) {
  const match = {};

  if (itemId) match.itemId = itemId;
  if (Array.isArray(itemIds) && itemIds.length) match.itemId = { $in: itemIds };
  if (warehouseId) match.warehouseId = warehouseId;

  return match;
}

/* Calcula stock de un item por agregación (opcional por bodega) */
async function calcStockForItem(itemId, { warehouseId, session } = {}) {
  const oid = toObjectId(itemId);
  if (!oid) return null;

  const wid = warehouseId ? toObjectId(warehouseId) : null;
  if (warehouseId && !wid) return null;

  const match = buildMovesMatch({ itemId: oid, warehouseId: wid });

  const rows = await StockMove.aggregate(
    [
      { $match: match },
      {
        $group: {
          _id: "$itemId",
          inQty: { $sum: { $cond: [{ $eq: ["$type", "IN"] }, "$qty", 0] } },
          outQty: { $sum: { $cond: [{ $eq: ["$type", "OUT"] }, "$qty", 0] } },
          adjDelta: { $sum: { $cond: [{ $eq: ["$type", "ADJUST"] }, "$qty", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          stock: { $subtract: [{ $add: ["$inQty", "$adjDelta"] }, "$outQty"] },
        },
      },
    ],
    { session }
  );

  if (!rows || !rows.length) return 0;
  const stock = Number(rows[0].stock);
  return Number.isFinite(stock) ? stock : 0;
}

/* Lista items con filtros y paginación */
async function listItems({ q, category, active, page, limit, sort }) {
  const filter = buildItemsFilter({ q, category, active });
  const sortObj = parseSort(sort, SORT_FIELDS_ITEMS, { name: 1 });

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    InventoryItem.find(filter).sort(sortObj).skip(skip).limit(l).lean(),
    InventoryItem.countDocuments(filter),
  ]);

  const pages = Math.max(1, Math.ceil(total / l));

  return {
    items,
    page: p,
    limit: l,
    total,
    pages,
  };
}

/* Obtiene item por id */
async function getItemById(id) {
  const oid = toObjectId(id);
  if (!oid) return null;

  const item = await InventoryItem.findById(oid).lean();
  return item || null;
}

/* Crea un item */
async function createItem({ name, category, unit, min_stock, active, createdBy }) {
  const doc = await InventoryItem.create({
    name,
    category,
    unit,
    min_stock,
    active,
    createdBy: createdBy ? toObjectId(createdBy) : null,
  });

  return doc.toObject();
}

/* Actualiza un item */
async function updateItem(id, patch, { updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) return null;

  const update = { ...patch };
  if (updatedBy) update.updatedBy = toObjectId(updatedBy);

  const doc = await InventoryItem.findOneAndUpdate({ _id: oid }, update, {
    new: true,
    runValidators: true,
  }).lean();

  return doc || null;
}

/* Desactiva un item (soft delete) */
async function deactivateItem(id, { updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) return false;

  const update = { active: false };
  if (updatedBy) update.updatedBy = toObjectId(updatedBy);

  const r = await InventoryItem.updateOne({ _id: oid }, update);
  return (r && r.matchedCount > 0) || false;
}

/* Verifica si un item tiene movimientos (en cualquier bodega) */
async function itemHasMoves(itemId) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const n = await StockMove.countDocuments({ itemId: oid });
  return Number(n) > 0;
}

/* Hard delete condicionado: solo elimina si no tiene movimientos */
async function hardDeleteItemIfNoMoves(itemId) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const exists = await InventoryItem.exists({ _id: oid });
  if (!exists) return false;

  const hasMoves = await itemHasMoves(oid);
  if (hasMoves) throw new Error("ITEM_HAS_MOVES");

  const r = await InventoryItem.deleteOne({ _id: oid });
  return (r && r.deletedCount > 0) || false;
}

/* Retorna stock de un item (opcional por bodega) */
async function getStockForItem(itemId, { warehouseId } = {}) {
  return calcStockForItem(itemId, { warehouseId });
}

/* Crea movimiento IN/OUT con validación de stock negativo (por bodega) */
async function createMove({ itemId, warehouseId, type, qty, note, transferId, createdBy }) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const wid = toObjectId(warehouseId);
  if (!wid) throw new Error("INVALID_WAREHOUSE_ID");

  const t = String(type || "").toUpperCase();
  if (!MOVE_TYPES.has(t)) throw new Error("INVALID_MOVE_TYPE");

  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) throw new Error("INVALID_QTY");

  const by = createdBy ? toObjectId(createdBy) : null;
  const xfer = transferId ? String(transferId).trim() : null;

  const session = await mongoose.startSession();
  try {
    let created = null;

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

      created = moveDoc[0].toObject();
    });

    return created;
  } finally {
    session.endSession();
  }
}

/* Crea movimiento ADJUST tipo set (to) por bodega */
async function createAdjustMoveSet({ itemId, warehouseId, to, note, createdBy }) {
  const oid = toObjectId(itemId);
  if (!oid) throw new Error("INVALID_ITEM_ID");

  const wid = toObjectId(warehouseId);
  if (!wid) throw new Error("INVALID_WAREHOUSE_ID");

  const target = Number(to);
  if (!Number.isFinite(target) || target < 0) throw new Error("INVALID_TO_STOCK");

  const by = createdBy ? toObjectId(createdBy) : null;

  const session = await mongoose.startSession();
  try {
    let created = null;

    await session.withTransaction(async () => {
      const current = await calcStockForItem(oid, { warehouseId: wid, session });
      if (!Number.isFinite(current)) throw new Error("STOCK_UNAVAILABLE");

      const delta = target - current;

      const moveDoc = await StockMove.create(
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

      created = moveDoc[0].toObject();
    });

    return created;
  } finally {
    session.endSession();
  }
}

/* Transfiere stock entre bodegas (OUT origen + IN destino en transacción) */
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
        { session }
      );

      outMove = created[0].toObject();
      inMove = created[1].toObject();
    });

    return { transferId, outMove, inMove };
  } finally {
    session.endSession();
  }
}

/* Lista movimientos con filtros y paginación (opcional por bodega) */
async function listMoves({ itemId, warehouseId, transferId, type, from, to, page, limit, sort }) {
  const filter = {};

  if (itemId) {
    const oid = toObjectId(itemId);
    if (!oid) return { items: [], page: 1, limit: Number(limit) || 50, total: 0, pages: 1 };
    filter.itemId = oid;
  }

  if (warehouseId) {
    const wid = toObjectId(warehouseId);
    if (!wid) return { items: [], page: 1, limit: Number(limit) || 50, total: 0, pages: 1 };
    filter.warehouseId = wid;
  }

  if (transferId) {
    filter.transferId = String(transferId).trim();
  }

  if (type) {
    const t = String(type).toUpperCase();
    if (MOVE_TYPES.has(t)) filter.type = t;
  }

  if (from || to) {
    filter.createdAt = {};
    if (from instanceof Date && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    if (to instanceof Date && !Number.isNaN(to.getTime())) filter.createdAt.$lte = to;
  }

  const sortObj = parseSort(sort, SORT_FIELDS_MOVES, { createdAt: -1 });

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    StockMove.find(filter).sort(sortObj).skip(skip).limit(l).lean(),
    StockMove.countDocuments(filter),
  ]);

  const pages = Math.max(1, Math.ceil(total / l));

  return {
    items,
    page: p,
    limit: l,
    total,
    pages,
  };
}

/* Retorna resumen de stock por item (opcional por bodega) */
async function getStockSummary({ q, category, active, warehouseId }) {
  const filter = buildItemsFilter({ q, category, active });

  const wid = warehouseId ? toObjectId(warehouseId) : null;
  if (warehouseId && !wid) return { items: [] };

  const items = await InventoryItem.find(filter).sort({ name: 1 }).lean();
  const ids = items.map((it) => it._id);

  if (!ids.length) {
    return { items: [] };
  }

  const match = buildMovesMatch({ itemIds: ids, warehouseId: wid });

  const rows = await StockMove.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$itemId",
        inQty: { $sum: { $cond: [{ $eq: ["$type", "IN"] }, "$qty", 0] } },
        outQty: { $sum: { $cond: [{ $eq: ["$type", "OUT"] }, "$qty", 0] } },
        adjDelta: { $sum: { $cond: [{ $eq: ["$type", "ADJUST"] }, "$qty", 0] } },
      },
    },
    {
      $project: {
        _id: 1,
        stock: { $subtract: [{ $add: ["$inQty", "$adjDelta"] }, "$outQty"] },
      },
    },
  ]);

  const stockMap = new Map(rows.map((r) => [String(r._id), Number(r.stock) || 0]));

  const merged = items.map((it) => {
    const stock = stockMap.get(String(it._id)) ?? 0;
    return { ...it, stock };
  });

  return { items: merged };
}

/* Retorna items con stock <= min_stock (opcional por bodega) */
async function getLowStockAlerts({ q, category, warehouseId }) {
  const filter = buildItemsFilter({ q, category, active: true });

  const wid = warehouseId ? toObjectId(warehouseId) : null;
  if (warehouseId && !wid) return { items: [] };

  const movesCollection = StockMove.collection.name;

  const rows = await InventoryItem.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: movesCollection,
        let: { itemId: "$_id", wid },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$itemId", "$$itemId"] },
                  ...(wid ? [{ $eq: ["$warehouseId", "$$wid"] }] : []),
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              inQty: { $sum: { $cond: [{ $eq: ["$type", "IN"] }, "$qty", 0] } },
              outQty: { $sum: { $cond: [{ $eq: ["$type", "OUT"] }, "$qty", 0] } },
              adjDelta: { $sum: { $cond: [{ $eq: ["$type", "ADJUST"] }, "$qty", 0] } },
            },
          },
        ],
        as: "m",
      },
    },
    {
      $addFields: {
        _m0: { $ifNull: [{ $arrayElemAt: ["$m", 0] }, null] },
      },
    },
    {
      $addFields: {
        stock: {
          $cond: [
            { $eq: ["$_m0", null] },
            0,
            { $subtract: [{ $add: ["$_m0.inQty", "$_m0.adjDelta"] }, "$_m0.outQty"] },
          ],
        },
      },
    },
    {
      $match: {
        $expr: { $lte: ["$stock", "$min_stock"] },
      },
    },
    { $project: { m: 0, _m0: 0 } },
    { $sort: { stock: 1, name: 1 } },
  ]);

  return { items: rows };
}

module.exports = {
  listItems,
  getItemById,
  createItem,
  updateItem,
  deactivateItem,
  itemHasMoves,
  hardDeleteItemIfNoMoves,
  getStockForItem,
  createMove,
  createAdjustMoveSet,
  transferStock,
  listMoves,
  getStockSummary,
  getLowStockAlerts,
};
