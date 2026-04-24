// Shared helpers for report endpoints.

/** Parse comma-separated or array query param into int[]; undefined if empty. */
export function parseIds(raw) {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);
  return String(raw).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
}

/** Convert cents BIGINT to lempiras (float, 2 decimals precision). */
export function centsToLmps(cents) {
  if (cents == null) return 0;
  return Number(cents) / 100;
}

/** Extract pagination from req.query with defaults. */
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query.page_size, 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Wrap a report handler with try/catch + standard response shape. */
export function reportHandler(fn) {
  return async (req, res, next) => {
    try {
      const { rows, total, totals, kpis, meta } = await fn(req);
      res.status(200).json({
        rows,
        total: total ?? (rows?.length ?? 0),
        totals: totals ?? undefined,
        kpis: kpis ?? undefined,
        meta: meta ?? {},
      });
    } catch (e) {
      next(e);
    }
  };
}
