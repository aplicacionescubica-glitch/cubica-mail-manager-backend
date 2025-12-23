const EmailLog = require("./emailLog.model");

/* Lista historial de correos procesados */
async function listEmailHistory(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));

    const statusRaw = String(req.query.status || "").trim();
    const qRaw = String(req.query.q || "").trim();

    const fromEmail = String(req.query.fromEmail || "").trim();
    const hasCotizacionRaw = String(req.query.hasCotizacion || "").trim();

    const dateFromRaw = String(req.query.dateFrom || "").trim();
    const dateToRaw = String(req.query.dateTo || "").trim();

    const filter = {};

    if (statusRaw && statusRaw.toLowerCase() !== "todos" && statusRaw.toLowerCase() !== "all") {
      filter.status = statusRaw;
    }

    if (fromEmail) {
      filter.fromEmail = { $regex: fromEmail, $options: "i" };
    }

    if (hasCotizacionRaw) {
      const v = hasCotizacionRaw.toLowerCase();
      if (v === "true" || v === "1") {
        filter.cotizacionId = { $ne: null };
      } else if (v === "false" || v === "0") {
        filter.cotizacionId = null;
      }
    }

    if (dateFromRaw || dateToRaw) {
      const range = {};
      if (dateFromRaw) {
        const d1 = new Date(dateFromRaw);
        if (!Number.isNaN(d1.getTime())) range.$gte = d1;
      }
      if (dateToRaw) {
        const d2 = new Date(dateToRaw);
        if (!Number.isNaN(d2.getTime())) range.$lte = d2;
      }
      if (Object.keys(range).length) {
        filter.receivedAt = range;
      }
    }

    if (qRaw) {
      filter.$text = { $search: qRaw };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      EmailLog.find(filter)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailLog.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: {
        items,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error listEmailHistory:", error.message);
    return res.status(500).json({
      ok: false,
      error: 500,
      message: "Error al listar historial de correos",
    });
  }
}

module.exports = {
  listEmailHistory,
};
