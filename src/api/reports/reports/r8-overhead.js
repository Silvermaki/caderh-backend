import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// R8: Overhead ejecutado por proyecto y trimestre.
// Filtro: expense_categories.is_overhead = TRUE.
// Año/trimestre por expense_date (fecha de negocio del gasto, NOT NULL desde
// la recaptura; created_dt es solo la fecha técnica de captura).
// overheadPresupuestado y pctEjecucionOverhead → missingInDb (no existe tabla de presupuesto programado).

const SQL = `
  WITH overhead AS (
    SELECT
      p.id                                         AS project_id,
      p.name                                       AS project_name,
      pe.amount                                    AS amount_cents,
      EXTRACT(YEAR    FROM pe.expense_date)::int   AS year,
      EXTRACT(QUARTER FROM pe.expense_date)::int   AS quarter
    FROM caderh.projects p
    LEFT JOIN caderh.project_expenses pe    ON pe.project_id = p.id
    LEFT JOIN caderh.expense_categories ec  ON ec.id = pe.expense_category_id
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
      AND ec.is_overhead = TRUE
      AND ($2::int IS NULL OR EXTRACT(YEAR FROM pe.expense_date)::int = $2)
  )
  SELECT
    project_id, project_name,
    COALESCE(SUM(CASE WHEN quarter = 1 THEN amount_cents ELSE 0 END), 0)::bigint AS q1_cents,
    COALESCE(SUM(CASE WHEN quarter = 2 THEN amount_cents ELSE 0 END), 0)::bigint AS q2_cents,
    COALESCE(SUM(CASE WHEN quarter = 3 THEN amount_cents ELSE 0 END), 0)::bigint AS q3_cents,
    COALESCE(SUM(CASE WHEN quarter = 4 THEN amount_cents ELSE 0 END), 0)::bigint AS q4_cents,
    COALESCE(SUM(amount_cents), 0)::bigint                                       AS total_cents
  FROM overhead
  WHERE project_id IS NOT NULL
  GROUP BY project_id, project_name
  ORDER BY project_name ASC
`;

export const handler = reportHandler(async (req) => {
  const rawProject = req.query.project;
  const projectUuids = !rawProject
    ? null
    : (Array.isArray(rawProject) ? rawProject : String(rawProject).split(','))
        .map((s) => String(s).trim()).filter(Boolean);
  const year = req.query.year ? parseInt(req.query.year, 10) : null;

  const [rows] = await sequelize.query(SQL, { bind: [projectUuids, year] });

  const out = rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    overheadPresupuestado: null,
    overheadQ1: centsToLmps(r.q1_cents),
    overheadQ2: centsToLmps(r.q2_cents),
    overheadQ3: centsToLmps(r.q3_cents),
    overheadQ4: centsToLmps(r.q4_cents),
    overheadTotal: centsToLmps(r.total_cents),
    pctEjecucionOverhead: null,
  }));

  const totals = out.reduce((acc, r) => ({
    overheadQ1: acc.overheadQ1 + r.overheadQ1,
    overheadQ2: acc.overheadQ2 + r.overheadQ2,
    overheadQ3: acc.overheadQ3 + r.overheadQ3,
    overheadQ4: acc.overheadQ4 + r.overheadQ4,
    overheadTotal: acc.overheadTotal + r.overheadTotal,
  }), { overheadQ1: 0, overheadQ2: 0, overheadQ3: 0, overheadQ4: 0, overheadTotal: 0 });

  return {
    rows: out,
    total: out.length,
    totals,
    meta: { missingColumns: ['overheadPresupuestado', 'pctEjecucionOverhead'] },
  };
});
