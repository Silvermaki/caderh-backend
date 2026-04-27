import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

const SQL = `
  WITH donations AS (
    SELECT
      EXTRACT(YEAR    FROM pd.created_dt)::int  AS year,
      EXTRACT(QUARTER FROM pd.created_dt)::int  AS quarter,
      pd.donation_type                          AS don_type,
      pd.amount                                 AS amount_cents
    FROM caderh.project_donations pd
  ),
  financing AS (
    SELECT
      EXTRACT(YEAR FROM pfs.created_dt)::int    AS year,
      pfs.amount                                AS amount_cents
    FROM caderh.project_financing_sources pfs
  ),
  by_year_quarter AS (
    SELECT
      year, quarter,
      SUM(CASE WHEN don_type = 'CASH' THEN amount_cents ELSE 0 END)::bigint AS desembolsado_cents,
      SUM(CASE WHEN don_type IN ('CASH','SUPPLY') THEN amount_cents ELSE 0 END)::bigint AS total_donaciones_cents
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

export const handler = reportHandler(async (req) => {
  const year = req.query.year ? parseInt(req.query.year, 10) : null;
  const [rows] = await sequelize.query(SQL, { bind: [year] });

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

  const totalPresupuestoCents = rows.reduce((s, r) => s + Number(r.presupuesto_cents ?? 0), 0);
  const totalPresupuesto = centsToLmps(totalPresupuestoCents);
  const totalDesembolso  = out.reduce((s, r) => s + r.desembolsado, 0);
  const totalDonaciones  = out.reduce((s, r) => s + r.donaciones,  0);
  const granTotal        = out.reduce((s, r) => s + r.granTotal,   0);

  const kpis = {
    ingresoPeriodo: granTotal,
    pctEjecucionGlobal: totalPresupuesto > 0 ? (totalDesembolso / totalPresupuesto) * 100 : 0,
    donaciones: totalDonaciones,
    granTotal,
  };

  return { rows: out, total: out.length, kpis };
});
