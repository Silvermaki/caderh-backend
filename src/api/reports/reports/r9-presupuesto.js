import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// R9: Presupuesto ejecutado vs programado por proyecto y rubro.
// Año/trimestre por expense_date (fecha de negocio del gasto, NOT NULL desde
// la recaptura; created_dt es solo la fecha técnica de captura).
// Columnas "programado", "% ejecución" y "saldo" son missingInDb (no existe
// tabla de presupuesto programado aún).
// Ejecutado = gasto en efectivo (criterio CADERH, igual que el header del
// proyecto): lo imputado a suministros/beneficios se rebaja de esas
// donaciones y no es presupuesto ejecutado. Se excluyen proyectos eliminados.

const SQL = `
  WITH ejecutado AS (
    SELECT
      p.id                                      AS project_id,
      p.name                                    AS project_name,
      ec.id                                     AS rubro_id,
      ec.name                                   AS rubro_name,
      pe.amount                                 AS amount_cents,
      EXTRACT(YEAR    FROM pe.expense_date)::int  AS year,
      EXTRACT(QUARTER FROM pe.expense_date)::int  AS quarter
    FROM caderh.projects p
    LEFT JOIN caderh.project_expenses pe   ON pe.project_id = p.id
    LEFT JOIN caderh.expense_categories ec ON ec.id = pe.expense_category_id
    LEFT JOIN caderh.project_donations pdo ON pdo.id = pe.project_donation_id
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
      AND p.project_status <> 'DELETED'
      AND (pe.project_donation_id IS NULL OR pdo.donation_type = 'CASH')
      AND ($2::int IS NULL OR EXTRACT(YEAR FROM pe.expense_date)::int = $2)
  )
  SELECT
    project_id, project_name, rubro_id, rubro_name,
    COALESCE(SUM(CASE WHEN quarter = 1 THEN amount_cents ELSE 0 END), 0)::bigint AS q1_cents,
    COALESCE(SUM(CASE WHEN quarter = 2 THEN amount_cents ELSE 0 END), 0)::bigint AS q2_cents,
    COALESCE(SUM(CASE WHEN quarter = 3 THEN amount_cents ELSE 0 END), 0)::bigint AS q3_cents,
    COALESCE(SUM(CASE WHEN quarter = 4 THEN amount_cents ELSE 0 END), 0)::bigint AS q4_cents,
    COALESCE(SUM(amount_cents), 0)::bigint                                       AS total_cents
  FROM ejecutado
  WHERE rubro_id IS NOT NULL
  GROUP BY project_id, project_name, rubro_id, rubro_name
  ORDER BY project_name, rubro_name
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
    rubroId: r.rubro_id,
    rubroName: r.rubro_name,
    presupuestoProgramado: null,
    ejecutadoQ1: centsToLmps(r.q1_cents),
    ejecutadoQ2: centsToLmps(r.q2_cents),
    ejecutadoQ3: centsToLmps(r.q3_cents),
    ejecutadoQ4: centsToLmps(r.q4_cents),
    ejecutadoTotal: centsToLmps(r.total_cents),
    pctEjecucion: null,
    saldoDisponible: null,
  }));

  return {
    rows: out,
    total: out.length,
    meta: { missingColumns: ['presupuestoProgramado', 'pctEjecucion', 'saldoDisponible'] },
  };
});
