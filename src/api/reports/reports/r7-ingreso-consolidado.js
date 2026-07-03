import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// Correcciones:
//   1. Se excluyen proyectos eliminados (soft delete): antes las donaciones y
//      fuentes de proyectos DELETED inflaban los totales.
//   2. El trimestre se deriva de la fecha de ingreso (disbursement_date),
//      con created_dt como respaldo — consistente con R6 (req 10).
//   3. Gran total ya no doble-cuenta el efectivo: "donaciones" ahora agrupa
//      solo especie/beneficio, y granTotal = efectivo + especie/beneficio.
const SQL = `
  WITH donations AS (
    SELECT
      EXTRACT(YEAR    FROM COALESCE(pd.disbursement_date, pd.created_dt))::int AS year,
      EXTRACT(QUARTER FROM COALESCE(pd.disbursement_date, pd.created_dt))::int AS quarter,
      pd.donation_type                          AS don_type,
      pd.amount                                 AS amount_cents
    FROM caderh.project_donations pd
    JOIN caderh.projects p ON p.id = pd.project_id AND p.project_status <> 'DELETED'
  ),
  financing AS (
    SELECT
      EXTRACT(YEAR FROM COALESCE(pfs.disbursement_date, pfs.created_dt))::int AS year,
      pfs.amount                                AS amount_cents
    FROM caderh.project_financing_sources pfs
    JOIN caderh.projects p ON p.id = pfs.project_id AND p.project_status <> 'DELETED'
  ),
  by_year_quarter AS (
    SELECT
      year, quarter,
      SUM(CASE WHEN don_type = 'CASH' THEN amount_cents ELSE 0 END)::bigint AS desembolsado_cents,
      SUM(CASE WHEN don_type <> 'CASH' THEN amount_cents ELSE 0 END)::bigint AS total_donaciones_cents
    FROM donations
    WHERE ($1::int IS NULL OR year = $1)
    GROUP BY year, quarter
  ),
  presupuesto_total AS (
    SELECT year, SUM(amount_cents)::bigint AS presupuesto_cents
    FROM financing
    WHERE ($1::int IS NULL OR year = $1)
    GROUP BY year
  )
  SELECT
    bq.year, bq.quarter,
    bq.desembolsado_cents, bq.total_donaciones_cents,
    COALESCE(pt.presupuesto_cents, 0) AS presupuesto_cents
  FROM by_year_quarter bq
  LEFT JOIN presupuesto_total pt ON pt.year = bq.year
  ORDER BY bq.year DESC, bq.quarter ASC
`;

// % de ejecución financiera del período (criterio CADERH): gastos ejecutados
// en efectivo ÷ ingresos recibidos en efectivo × 100. La especie queda fuera.
// Gasto en efectivo = no imputado a una donación en especie/beneficio.
const CASH_EXECUTION_SQL = `
  SELECT
    (
      COALESCE((SELECT SUM(pfs.amount) FROM caderh.project_financing_sources pfs
        JOIN caderh.projects p ON p.id = pfs.project_id AND p.project_status <> 'DELETED'
        WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM COALESCE(pfs.disbursement_date, pfs.created_dt)) = $1)), 0)
      +
      COALESCE((SELECT SUM(pd.amount) FROM caderh.project_donations pd
        JOIN caderh.projects p ON p.id = pd.project_id AND p.project_status <> 'DELETED'
        WHERE pd.donation_type = 'CASH'
          AND ($1::int IS NULL OR EXTRACT(YEAR FROM COALESCE(pd.disbursement_date, pd.created_dt)) = $1)), 0)
    )::bigint AS ingresos_efectivo_cents,
    COALESCE((SELECT SUM(pe.amount) FROM caderh.project_expenses pe
      JOIN caderh.projects p ON p.id = pe.project_id AND p.project_status <> 'DELETED'
      LEFT JOIN caderh.project_donations pdo ON pdo.id = pe.project_donation_id
      WHERE (pe.project_donation_id IS NULL OR pdo.donation_type = 'CASH')
        AND ($1::int IS NULL OR EXTRACT(YEAR FROM pe.created_dt) = $1)), 0)::bigint AS gastos_efectivo_cents
`;

export const handler = reportHandler(async (req) => {
  const year = req.query.year ? parseInt(req.query.year, 10) : null;
  const [rows] = await sequelize.query(SQL, { bind: [year] });
  const [[cashExec]] = await sequelize.query(CASH_EXECUTION_SQL, { bind: [year] });

  const out = rows.map((r) => {
    const desembolsado = centsToLmps(r.desembolsado_cents);
    const donaciones   = centsToLmps(r.total_donaciones_cents);
    const presupuesto  = centsToLmps(r.presupuesto_cents);
    return {
      year: r.year,
      quarter: `Q${r.quarter}`,
      desembolsado,
      donaciones,
      granTotal: desembolsado + donaciones,
      pctSobrePresupuesto: presupuesto > 0 ? (desembolsado / presupuesto) * 100 : 0,
    };
  });

  const totalDonaciones  = out.reduce((s, r) => s + r.donaciones,  0);
  const granTotal        = out.reduce((s, r) => s + r.granTotal,   0);

  const ingresosEfectivo = centsToLmps(cashExec?.ingresos_efectivo_cents ?? 0);
  const gastosEfectivo   = centsToLmps(cashExec?.gastos_efectivo_cents ?? 0);

  const kpis = {
    ingresoPeriodo: granTotal,
    pctEjecucionGlobal: ingresosEfectivo > 0 ? (gastosEfectivo / ingresosEfectivo) * 100 : 0,
    donaciones: totalDonaciones,
    granTotal,
  };

  return { rows: out, total: out.length, kpis };
});
