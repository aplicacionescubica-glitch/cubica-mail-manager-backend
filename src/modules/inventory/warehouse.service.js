const mongoose = require("mongoose");

const Warehouse = require("./warehouse.model");

const SORT_FIELDS = new Set(["name", "code", "active", "createdAt", "updatedAt"]);

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
function parseSort(sortStr, fallback) {
  const s = String(sortStr || "").trim();
  if (!s) return fallback;

  const [fieldRaw, dirRaw] = s.split(":").map((p) => String(p || "").trim());
  const field = fieldRaw || "";
  const dir = (dirRaw || "asc").toLowerCase();

  if (!SORT_FIELDS.has(field)) return fallback;
  const order = dir === "desc" ? -1 : 1;

  return { [field]: order };
}

/* Construye filtro de bodegas */
function buildFilter({ q, active }) {
  const filter = {};

  if (active === true || active === false) filter.active = active;

  if (q) {
    const rx = new RegExp(escapeRegex(String(q).trim()), "i");
    filter.$or = [{ name: rx }, { code: rx }, { description: rx }];
  }

  return filter;
}

/* Lista bodegas con filtros y paginación */
async function listWarehouses({ q, active, page, limit, sort }) {
  const filter = buildFilter({ q, active });
  const sortObj = parseSort(sort, { name: 1 });

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    Warehouse.find(filter).sort(sortObj).skip(skip).limit(l).lean(),
    Warehouse.countDocuments(filter),
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

/* Obtiene bodega por id */
async function getWarehouseById(id) {
  const oid = toObjectId(id);
  if (!oid) return null;

  const doc = await Warehouse.findById(oid).lean();
  return doc || null;
}

/* Crea una bodega */
async function createWarehouse({ name, code, description, active, createdBy }) {
  const doc = await Warehouse.create({
    name,
    code,
    description: description || null,
    active: active !== false,
    createdBy: createdBy ? toObjectId(createdBy) : null,
  });

  return doc.toObject();
}

/* Actualiza una bodega */
async function updateWarehouse(id, patch, { updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) return null;

  const update = { ...patch };
  if (updatedBy) update.updatedBy = toObjectId(updatedBy);

  const doc = await Warehouse.findOneAndUpdate({ _id: oid }, update, {
    new: true,
    runValidators: true,
  }).lean();

  return doc || null;
}

/* Desactiva una bodega (soft delete) */
async function deactivateWarehouse(id, { updatedBy } = {}) {
  const oid = toObjectId(id);
  if (!oid) return false;

  const update = { active: false };
  if (updatedBy) update.updatedBy = toObjectId(updatedBy);

  const r = await Warehouse.updateOne({ _id: oid }, update);
  return (r && r.matchedCount > 0) || false;
}

module.exports = {
  listWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deactivateWarehouse,
};
