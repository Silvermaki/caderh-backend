import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// R6: Ingreso total por proyecto.
//
// Modelo: cada registro en project_financing_sources representa UN desembolso
// de una fuente al proyecto, con su monto y disbursement_date (NOT NULL desde
// la recaptura). Q1-Q4 se derivan del trimestre calendario de disbursement_date.
//
// Reglas:
//   1. DESEMB. Q1-Q4 vienen de project_financing_sources agrupadas por
//      QUARTER(disbursement_date). No se infieren de donaciones CASH.
//   2. Presupuesto Global = SUM(financing_sources) + SUM(donations) (todas)
//      — misma fórmula que el dashboard del proyecto (financed_amount).
//   3. Donaciones en efectivo son una columna aparte (detalle);
//      no se cuentan como desembolso.
//   4. Vigencia (req 6): solo se incluyen movimientos cuya fecha de NEGOCIO cae
//      dentro del período de ejecución del proyecto (start_date..end_date):
//      fuentes y donaciones por disbursement_date, gastos por expense_date
//      (created_dt es solo la fecha técnica de captura). Con las fechas
//      NOT NULL del esquema post-recaptura ya no existe el bucket "sin fecha".
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
      AND pfs.disbursement_date BETWEEN p.start_date AND p.end_date
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
      AND p.project_status = 'ACTIVE'
  ),
  donations AS (
    SELECT
      p.id                                          AS project_id,
      pd.amount                                     AS don_amount,
      pd.donation_type                              AS don_type,
      EXTRACT(YEAR FROM pd.disbursement_date)::int  AS don_year
    FROM caderh.projects p
    LEFT JOIN caderh.project_donations pd ON pd.project_id = p.id
      AND pd.disbursement_date BETWEEN p.start_date AND p.end_date
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ),
  expenses AS (
    SELECT
      p.id                                          AS project_id,
      pe.amount                                     AS exp_amount,
      EXTRACT(YEAR FROM pe.expense_date)::int       AS exp_year,
      -- Tipo de la donación de origen del gasto (NULL si el gasto es general
      -- o va contra una fuente): permite separar gastos monetarios de especie.
      pdo.donation_type                             AS exp_don_type
    FROM caderh.projects p
    LEFT JOIN caderh.project_expenses pe ON pe.project_id = p.id
      AND pe.expense_date BETWEEN p.start_date AND p.end_date
    LEFT JOIN caderh.project_donations pdo ON pdo.id = pe.project_donation_id
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ),
  -- Tabla conductora: TODOS los proyectos del filtro. Así un proyecto no
  -- desaparece del reporte (ni de los totales) cuando sus fuentes son de otro
  -- año pero sí tiene donaciones o gastos en el año consultado.
  proj AS (
    SELECT p.id AS project_id, p.name AS project_name
    FROM caderh.projects p
    WHERE ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
      AND p.project_status = 'ACTIVE'
  ),
  finance_agg AS (
    SELECT
      project_id,
      COALESCE(SUM(fin_amount), 0)::bigint AS financing_total_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 1 THEN fin_amount ELSE 0 END), 0)::bigint AS q1_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 2 THEN fin_amount ELSE 0 END), 0)::bigint AS q2_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 3 THEN fin_amount ELSE 0 END), 0)::bigint AS q3_cents,
      COALESCE(SUM(CASE WHEN fin_quarter = 4 THEN fin_amount ELSE 0 END), 0)::bigint AS q4_cents
    FROM financing
    WHERE ($2::int IS NULL OR fin_year = $2)
    GROUP BY project_id
  ),
  donations_agg AS (
    SELECT
      project_id,
      COALESCE(SUM(don_amount), 0)::bigint AS total_don_cents,
      COALESCE(SUM(CASE WHEN don_type = 'SUPPLY' THEN don_amount ELSE 0 END), 0)::bigint AS in_kind_cents,
      COALESCE(SUM(CASE WHEN don_type = 'CASH'   THEN don_amount ELSE 0 END), 0)::bigint AS cash_cents
    FROM donations
    WHERE ($2::int IS NULL OR don_year = $2)
    GROUP BY project_id
  ),
  expenses_agg AS (
    SELECT
      project_id,
      COALESCE(SUM(exp_amount), 0)::bigint AS gastos_cents,
      -- Gastos en efectivo: excluye los imputados a donaciones en especie o
      -- beneficio (criterio CADERH para el % de ejecución financiera).
      COALESCE(SUM(CASE WHEN exp_don_type IS NULL OR exp_don_type = 'CASH' THEN exp_amount ELSE 0 END), 0)::bigint AS gastos_efectivo_cents
    FROM expenses
    WHERE ($2::int IS NULL OR exp_year = $2)
    GROUP BY project_id
  )
  SELECT
    pr.project_id,
    pr.project_name,
    -- Presupuesto Global = financing_sources + todas las donaciones (igual que dashboard)
    (COALESCE(fa.financing_total_cents, 0) + COALESCE(da.total_don_cents, 0)) AS presupuesto_global_cents,
    -- Presupuesto Anual: por ahora se mantiene aliased al global (a definir)
    (COALESCE(fa.financing_total_cents, 0) + COALESCE(da.total_don_cents, 0)) AS presupuesto_anual_cents,
    COALESCE(fa.q1_cents, 0)                                   AS desembolso_q1_cents,
    COALESCE(fa.q2_cents, 0)                                   AS desembolso_q2_cents,
    COALESCE(fa.q3_cents, 0)                                   AS desembolso_q3_cents,
    COALESCE(fa.q4_cents, 0)                                   AS desembolso_q4_cents,
    (COALESCE(fa.q1_cents, 0) + COALESCE(fa.q2_cents, 0) + COALESCE(fa.q3_cents, 0) + COALESCE(fa.q4_cents, 0)) AS total_desembolsado_cents,
    COALESCE(fa.financing_total_cents, 0)                      AS total_financiamiento_cents,
    COALESCE(da.in_kind_cents, 0)                              AS donaciones_especie_cents,
    COALESCE(da.cash_cents,    0)                              AS donaciones_efectivo_cents,
    COALESCE(ea.gastos_cents,  0)                              AS gastos_ejecutados_cents,
    (COALESCE(fa.financing_total_cents, 0) + COALESCE(da.total_don_cents, 0) - COALESCE(ea.gastos_cents, 0)) AS saldo_disponible_cents,
    -- Ingresos en efectivo del período: fuentes + donaciones CASH. Con
    -- disbursement_date NOT NULL toda fuente está fechada, así que el filtro
    -- de año aplica simétrico a fuentes y gastos (ya no hay bucket sin fecha).
    (COALESCE(fa.financing_total_cents, 0) + COALESCE(da.cash_cents, 0)) AS ingresos_efectivo_cents,
    COALESCE(ea.gastos_efectivo_cents, 0)                      AS gastos_efectivo_cents
  FROM proj pr
  LEFT JOIN finance_agg fa ON fa.project_id = pr.project_id
  LEFT JOIN donations_agg da ON da.project_id = pr.project_id
  LEFT JOIN expenses_agg ea ON ea.project_id = pr.project_id
  ORDER BY pr.project_name ASC
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
    // % de ejecución financiera (criterio CADERH): gastos ejecutados en
    // efectivo ÷ ingresos recibidos en efectivo × 100 (especie excluida).
    const ingresosEfectivo    = centsToLmps(r.ingresos_efectivo_cents);
    const gastosEfectivo      = centsToLmps(r.gastos_efectivo_cents);
    const pctEjecucion        = ingresosEfectivo > 0
      ? (gastosEfectivo / ingresosEfectivo) * 100
      : 0;
    return {
      ingresosEfectivo,
      gastosEfectivo,
      projectId:            r.project_id,
      projectName:          r.project_name,
      presupuestoGlobal,
      presupuestoAnual:     centsToLmps(r.presupuesto_anual_cents),
      desembolsoQ1:         centsToLmps(r.desembolso_q1_cents),
      desembolsoQ2:         centsToLmps(r.desembolso_q2_cents),
      desembolsoQ3:         centsToLmps(r.desembolso_q3_cents),
      desembolsoQ4:         centsToLmps(r.desembolso_q4_cents),
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
    totalDesembolsado:   acc.totalDesembolsado   + r.totalDesembolsado,
    donacionesEspecie:   acc.donacionesEspecie   + r.donacionesEspecie,
    donacionesEfectivo:  acc.donacionesEfectivo  + r.donacionesEfectivo,
    gastosEjecutados:    acc.gastosEjecutados    + r.gastosEjecutados,
    saldoDisponible:     acc.saldoDisponible     + r.saldoDisponible,
    ingresosEfectivo:    acc.ingresosEfectivo    + r.ingresosEfectivo,
    gastosEfectivo:      acc.gastosEfectivo      + r.gastosEfectivo,
  }), {
    presupuestoGlobal: 0, presupuestoAnual: 0,
    desembolsoQ1: 0, desembolsoQ2: 0, desembolsoQ3: 0, desembolsoQ4: 0,
    totalDesembolsado: 0,
    donacionesEspecie: 0, donacionesEfectivo: 0,
    gastosEjecutados: 0, saldoDisponible: 0,
    ingresosEfectivo: 0, gastosEfectivo: 0,
  });
  totals.pctEjecucion = totals.ingresosEfectivo > 0
    ? (totals.gastosEfectivo / totals.ingresosEfectivo) * 100
    : 0;

  return { rows: out, total: out.length, totals };
});
