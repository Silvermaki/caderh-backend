import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// R6: Ingreso total por proyecto.
// Source: project_financing_sources (presupuesto) + project_donations (desembolsos + donaciones).
// Amounts in cents (BIGINT). Quarters derived from created_dt.

const SQL = `
  WITH financing AS (
    SELECT
      p.id                                         AS project_id,
      p.name                                       AS project_name,
      pfs.amount                                   AS fin_amount,
      EXTRACT(YEAR FROM pfs.created_dt)::int       AS fin_year
    FROM caderh.projects p
    LEFT JOIN caderh.project_financing_sources pfs ON pfs.project_id = p.id
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
      AND p.project_status = 'ACTIVE'
  ),
  donations AS (
    SELECT
      p.id                                         AS project_id,
      pd.amount                                    AS don_amount,
      pd.donation_type                             AS don_type,
      EXTRACT(YEAR    FROM pd.created_dt)::int     AS don_year,
      EXTRACT(QUARTER FROM pd.created_dt)::int     AS don_quarter
    FROM caderh.projects p
    LEFT JOIN caderh.project_donations pd ON pd.project_id = p.id
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ),
  finance_agg AS (
    SELECT
      project_id, project_name,
      COALESCE(SUM(fin_amount), 0)::bigint AS presupuesto_global_cents
    FROM financing
    WHERE ($2::int IS NULL OR fin_year = $2)
    GROUP BY project_id, project_name
  ),
  donations_agg AS (
    SELECT
      project_id,
      COALESCE(SUM(CASE WHEN don_type = 'CASH' AND don_quarter = 1 THEN don_amount ELSE 0 END), 0)::bigint AS q1_cents,
      COALESCE(SUM(CASE WHEN don_type = 'CASH' AND don_quarter = 2 THEN don_amount ELSE 0 END), 0)::bigint AS q2_cents,
      COALESCE(SUM(CASE WHEN don_type = 'CASH' AND don_quarter = 3 THEN don_amount ELSE 0 END), 0)::bigint AS q3_cents,
      COALESCE(SUM(CASE WHEN don_type = 'CASH' AND don_quarter = 4 THEN don_amount ELSE 0 END), 0)::bigint AS q4_cents,
      COALESCE(SUM(CASE WHEN don_type = 'SUPPLY' THEN don_amount ELSE 0 END), 0)::bigint AS in_kind_cents,
      COALESCE(SUM(CASE WHEN don_type = 'CASH'   THEN don_amount ELSE 0 END), 0)::bigint AS cash_cents
    FROM donations
    WHERE ($2::int IS NULL OR don_year = $2)
    GROUP BY project_id
  )
  SELECT
    fa.project_id,
    fa.project_name,
    fa.presupuesto_global_cents,
    fa.presupuesto_global_cents                              AS presupuesto_anual_cents,
    COALESCE(da.q1_cents, 0)                                 AS desembolso_q1_cents,
    COALESCE(da.q2_cents, 0)                                 AS desembolso_q2_cents,
    COALESCE(da.q3_cents, 0)                                 AS desembolso_q3_cents,
    COALESCE(da.q4_cents, 0)                                 AS desembolso_q4_cents,
    (COALESCE(da.q1_cents,0) + COALESCE(da.q2_cents,0) +
     COALESCE(da.q3_cents,0) + COALESCE(da.q4_cents,0))      AS total_desembolsado_cents,
    COALESCE(da.in_kind_cents, 0)                            AS donaciones_especie_cents,
    COALESCE(da.cash_cents,    0)                            AS donaciones_efectivo_cents
  FROM finance_agg fa
  LEFT JOIN donations_agg da ON fa.project_id = da.project_id
  ORDER BY fa.project_name ASC
`;

export const handler = reportHandler(async (req) => {
  const year = req.query.year ? parseInt(req.query.year, 10) : null;

  // projects.id is UUID — parse query param directly as string array.
  const rawProject = req.query.project;
  const projectUuids = !rawProject
    ? null
    : (Array.isArray(rawProject) ? rawProject : String(rawProject).split(','))
        .map((s) => String(s).trim())
        .filter(Boolean);

  const [rows] = await sequelize.query(SQL, {
    bind: [projectUuids, year],
  });

  const out = rows.map((r) => {
    const presupuestoAnual  = centsToLmps(r.presupuesto_anual_cents);
    const totalDesembolsado = centsToLmps(r.total_desembolsado_cents);
    const pctEjecucion      = presupuestoAnual > 0 ? (totalDesembolsado / presupuestoAnual) * 100 : 0;
    return {
      projectId:           r.project_id,
      projectName:         r.project_name,
      presupuestoGlobal:   centsToLmps(r.presupuesto_global_cents),
      presupuestoAnual,
      desembolsoQ1:        centsToLmps(r.desembolso_q1_cents),
      desembolsoQ2:        centsToLmps(r.desembolso_q2_cents),
      desembolsoQ3:        centsToLmps(r.desembolso_q3_cents),
      desembolsoQ4:        centsToLmps(r.desembolso_q4_cents),
      totalDesembolsado,
      pctEjecucion,
      donacionesEspecie:   centsToLmps(r.donaciones_especie_cents),
      donacionesEfectivo:  centsToLmps(r.donaciones_efectivo_cents),
    };
  });

  // Totals row
  const totals = out.reduce((acc, r) => ({
    presupuestoGlobal:  acc.presupuestoGlobal  + r.presupuestoGlobal,
    presupuestoAnual:   acc.presupuestoAnual   + r.presupuestoAnual,
    desembolsoQ1:       acc.desembolsoQ1       + r.desembolsoQ1,
    desembolsoQ2:       acc.desembolsoQ2       + r.desembolsoQ2,
    desembolsoQ3:       acc.desembolsoQ3       + r.desembolsoQ3,
    desembolsoQ4:       acc.desembolsoQ4       + r.desembolsoQ4,
    totalDesembolsado:  acc.totalDesembolsado  + r.totalDesembolsado,
    donacionesEspecie:  acc.donacionesEspecie  + r.donacionesEspecie,
    donacionesEfectivo: acc.donacionesEfectivo + r.donacionesEfectivo,
  }), {
    presupuestoGlobal: 0, presupuestoAnual: 0,
    desembolsoQ1: 0, desembolsoQ2: 0, desembolsoQ3: 0, desembolsoQ4: 0,
    totalDesembolsado: 0,
    donacionesEspecie: 0, donacionesEfectivo: 0,
  });
  totals.pctEjecucion = totals.presupuestoAnual > 0
    ? (totals.totalDesembolsado / totals.presupuestoAnual) * 100
    : 0;

  return { rows: out, total: out.length, totals };
});
