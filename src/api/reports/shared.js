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

// Tope para exportaciones (page_size=all): la exportación a Excel/PDF debe
// llevar TODAS las filas del filtro, no solo la página visible.
export const EXPORT_MAX_ROWS = 100000;

/** Extract pagination from req.query with defaults. `page_size=all` = sin paginar (exportación). */
export function parsePagination(query) {
  if (String(query.page_size) === 'all') {
    return { page: 1, pageSize: EXPORT_MAX_ROWS, offset: 0, all: true };
  }
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query.page_size, 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize, all: false };
}

// ─── Parsers de filtros (comunes a los reportes) ────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function splitList(raw) {
  return (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

/** 'uuid,uuid' → string[] de UUIDs válidos; null si vacío. */
export function parseUuidList(raw) {
  if (!raw) return null;
  const arr = splitList(raw).filter((s) => UUID_RE.test(s));
  return arr.length ? arr : null;
}

/** '1,2' → int[]; null si vacío. */
export function parseIntList(raw) {
  if (!raw) return null;
  const arr = splitList(raw).map((s) => parseInt(s, 10)).filter(Number.isFinite);
  return arr.length ? arr : null;
}

/** Entero o null. */
export function parseIntValue(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** 'YYYY-MM-DD' válido o null. */
export function parseIsoDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

/** Lista de textos restringida a un conjunto permitido; null si vacía. */
export function parseEnumList(raw, allowed) {
  if (!raw) return null;
  const set = new Set(allowed);
  const arr = splitList(raw).map((s) => s.toUpperCase()).filter((s) => set.has(s));
  return arr.length ? arr : null;
}

/** Género canónico M/F a partir de las variantes heredadas (para SQL). */
export const GENERO_SQL = (col) => `
  CASE
    WHEN UPPER(TRIM(COALESCE(${col},''))) IN ('M','MASCULINO','HOMBRE') THEN 'M'
    WHEN UPPER(TRIM(COALESCE(${col},''))) IN ('F','FEMENINO','MUJER')   THEN 'F'
    ELSE NULL
  END`;

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
