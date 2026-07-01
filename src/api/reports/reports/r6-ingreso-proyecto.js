import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// R6: Ingreso total por proyecto.
//
// Modelo: cada registro en project_financing_sources representa UN desembolso
// de una fuente al proyecto, con su monto y disbursement_date. Q1-Q4 se derivan
// del trimestre calendario de disbursement_date (NULL excluído de los buckets
// por trimestre, pero sí incluído en presupuesto global).
//
// Cambios vs versión anterior:
//   1. DESEMB. Q1-Q4 ya NO se infieren de donaciones CASH. Vienen de
//      project_financing_sources agrupadas por QUARTER(disbursement_date).
//   2. Presupuesto Global = SUM(financing_sources) + SUM(donations) (todas)
//      — misma fórmula que el dashboard del proyecto (financed_amount).
//   3. Donaciones en efectivo siguen siendo una columna aparte (detalle).
//      Ya no se cuentan como desembolso.
//   4. Vigencia (req 6): solo se incluyen movimientos con fecha dentro del
//      período de ejecución del proyecto (start_date..end_date). Los
//      registros sin fecha van al bucket "sin fecha" (fuentes) o usan
//      created_dt (donaciones/gastos).
//   5. Reporte financiero (req 8): se agregan gastos ejecutados y saldo
//      disponible (ingresos recibidos − gastos ejecutados).

const SQL = `
  WITH financing AS (
    SELECT
      p.id                                          AS project_id,
      p.name                                        AS project_name,
      pfs.amount                                    AS fin_amount,
      EXTRACT(YEAR    FROM pfs.disbursement_date)::int AS fin_year,
      EXTRACT(QUARTER FROM pfs.disbursement_date)::int AS fin_quarter
    FROM caderh.projects p
    LEFT JOIN caderh.project_financing_sources pfs ON pfs.project_id = p.id
      AND (pfs.disbursement_date IS NULL OR pfs.disbursement_date BETWEEN p.start_date AND p.end_date)
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
      AND p.project_status = 'ACTIVE'
  ),
  donations AS (
    SELECT
      p.id                                          AS project_id,
      pd.amount                                     AS don_amount,
      pd.donation_type                              AS don_type,
      EXTRACT(YEAR FROM COALESCE(pd.disbursement_date, pd.created_dt))::int AS don_year
    FROM caderh.projects p
    LEFT JOIN caderh.project_donations pd ON pd.project_id = p.id
      AND COALESCE(pd.disbursement_date, pd.created_dt::date) BETWEEN p.start_date AND p.end_date
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ),
  expenses AS (
    SELECT
      p.id                                          AS project_id,
      pe.amount                                     AS exp_amount,
      EXTRACT(YEAR FROM pe.created_dt)::int         AS exp_year
    FROM caderh.projects p
    LEFT JOIN caderh.project_expenses pe ON pe.project_id = p.id
      AND pe.created_dt::date BETWEEN p.start_date AND p.end_date
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ),
  finance_agg AS (
    SELECT
      project_id, project_name,
      COALESCE(SUM(fin_amount), 0)::bigint AS financing_total_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 1 THEN fin_amount ELSE 0 END), 0)::bigint AS q1_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 2 THEN fin_amount ELSE 0 END), 0)::bigint AS q2_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 3 THEN fin_amount ELSE 0 END), 0)::bigint AS q3_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 4 THEN fin_amount ELSE 0 END), 0)::bigint AS q4_cents,
      COALESCE(SUM(CASE WHEN fin_quarter IS NULL THEN fin_amount ELSE 0 END), 0)::bigint AS sin_fecha_cents
    FROM financing
    WHERE ($2::int IS NULL OR fin_year = $2 OR fin_year IS NULL)
    GROUP BY project_id, project_name
  ),
  donations_agg AS (
    SELECT
      project_id,
      COALESCE(SUM(don_amount), 0)::bigint AS total_don_cents,
      COALESCE(SUM(CASE WHEN don_type = 'SUPPLY' THEN don_amount ELSE 0 END), 0)::bigint AS in_kind_cents,
      COALESCE(SUM(CASE WHEN don_type = 'CASH'   THEN don_amount ELSE 0 END), 0)::bigint AS cash_cents
    FROM donations
    WHERE ($2::int IS NULL OR don_year = $2 OR don_year IS NULL)
    GROUP BY project_id
  ),
  expenses_agg AS (
    SELECT
      project_id,
      COALESCE(SUM(exp_amount), 0)::bigint AS gastos_cents
    FROM expenses
    WHERE ($2::int IS NULL OR exp_year = $2 OR exp_year IS NULL)
    GROUP BY project_id
  )
  SELECT
    fa.project_id,
    fa.project_name,
    -- Presupuesto Global = financing_sources + todas las donaciones (igual que dashboard)
    (fa.financing_total_cents + COALESCE(da.total_don_cents, 0)) AS presupuesto_global_cents,
    -- Presupuesto Anual: por ahora se mantiene aliased al global (a definir)
    (fa.financing_total_cents + COALESCE(da.total_don_cents, 0)) AS presupuesto_anual_cents,
    fa.q1_cents                                                AS desembolso_q1_cents,
    fa.q2_cents                                                AS desembolso_q2_cents,
    fa.q3_cents                                                AS desembolso_q3_cents,
    fa.q4_cents                                                AS desembolso_q4_cents,
    fa.sin_fecha_cents                                         AS desembolso_sin_fecha_cents,
    (fa.q1_cents + fa.q2_cents + fa.q3_cents + fa.q4_cents)    AS total_desembolsado_cents,
    fa.financing_total_cents                                   AS total_financiamiento_cents,
    COALESCE(da.in_kind_cents, 0)                              AS donaciones_especie_cents,
    COALESCE(da.cash_cents,    0)                              AS donaciones_efectivo_cents,
    COALESCE(ea.gastos_cents,  0)                              AS gastos_ejecutados_cents,
    (fa.financing_total_cents + COALESCE(da.total_don_cents, 0) - COALESCE(ea.gastos_cents, 0)) AS saldo_disponible_cents
  FROM finance_agg fa
  LEFT JOIN donations_agg da ON fa.project_id = da.project_id
  LEFT JOIN expenses_agg ea ON fa.project_id = ea.project_id
  ORDER BY fa.project_name ASC
`;

export const handler = reportHandler(async (req) => {
  const year = req.query.year ? parseInt(req.query.year, 10) : null;

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
    const presupuestoGlobal   = centsToLmps(r.presupuesto_global_cents);
    const totalDesembolsado   = centsToLmps(r.total_desembolsado_cents);
    const pctEjecucion        = presupuestoGlobal > 0
      ? (totalDesembolsado / presupuestoGlobal) * 100
      : 0;
    return {
      projectId:            r.project_id,
      projectName:          r.project_name,
      presupuestoGlobal,
      presupuestoAnual:     centsToLmps(r.presupuesto_anual_cents),
      desembolsoQ1:         centsToLmps(r.desembolso_q1_cents),
      desembolsoQ2:         centsToLmps(r.desembolso_q2_cents),
      desembolsoQ3:         centsToLmps(r.desembolso_q3_cents),
      desembolsoQ4:         centsToLmps(r.desembolso_q4_cents),
      desembolsoSinFecha:   centsToLmps(r.desembolso_sin_fecha_cents),
      totalDesembolsado,
      pctEjecucion,
      donacionesEspecie:    centsToLmps(r.donaciones_especie_cents),
      donacionesEfectivo:   centsToLmps(r.donaciones_efectivo_cents),
      gastosEjecutados:     centsToLmps(r.gastos_ejecutados_cents),
      saldoDisponible:      centsToLmps(r.saldo_disponible_cents),
    };
  });

  const totals = out.reduce((acc, r) => ({
    presupuestoGlobal:   acc.presupuestoGlobal   + r.presupuestoGlobal,
    presupuestoAnual:    acc.presupuestoAnual    + r.presupuestoAnual,
    desembolsoQ1:        acc.desembolsoQ1        + r.desembolsoQ1,
    desembolsoQ2:        acc.desembolsoQ2        + r.desembolsoQ2,
    desembolsoQ3:        acc.desembolsoQ3        + r.desembolsoQ3,
    desembolsoQ4:        acc.desembolsoQ4        + r.desembolsoQ4,
    desembolsoSinFecha:  acc.desembolsoSinFecha  + r.desembolsoSinFecha,
    totalDesembolsado:   acc.totalDesembolsado   + r.totalDesembolsado,
    donacionesEspecie:   acc.donacionesEspecie   + r.donacionesEspecie,
    donacionesEfectivo:  acc.donacionesEfectivo  + r.donacionesEfectivo,
    gastosEjecutados:    acc.gastosEjecutados    + r.gastosEjecutados,
    saldoDisponible:     acc.saldoDisponible     + r.saldoDisponible,
  }), {
    presupuestoGlobal: 0, presupuestoAnual: 0,
    desembolsoQ1: 0, desembolsoQ2: 0, desembolsoQ3: 0, desembolsoQ4: 0,
    desembolsoSinFecha: 0,
    totalDesembolsado: 0,
    donacionesEspecie: 0, donacionesEfectivo: 0,
    gastosEjecutados: 0, saldoDisponible: 0,
  });
  totals.pctEjecucion = totals.presupuestoGlobal > 0
    ? (totals.totalDesembolsado / totals.presupuestoGlobal) * 100
    : 0;

  return { rows: out, total: out.length, totals };
});
