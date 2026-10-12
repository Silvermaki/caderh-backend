import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, centsToLmps } from '../shared.js';

// R7: Ingreso total consolidado — trimestral y anual, con % de ejecución.
//
// Criterio CADERH (igual que el header del proyecto, R6 y el dashboard): solo
// el efectivo es ingreso ("Donaciones: en especie (ahorro) y en efectivo (es
// un ingreso)").
//   · Ingresos en efectivo = desembolsos de fuentes de financiamiento +
//     donaciones CASH, por trimestre de su fecha de ingreso (disbursement_date).
//     Antes las filas se armaban solo con donaciones y las fuentes —el ingreso
//     principal— no aparecían: un año sin donaciones salía vacío.
//   · Gastos en efectivo = gastos generales, contra fuente o contra donación
//     CASH, por trimestre de expense_date. Los imputados a suministros o
//     beneficios se rebajan de esas donaciones; no son presupuesto ejecutado.
//   · % de ejecución ACUMULADO = gastos del año hasta ese trimestre ÷ ingresos
//     del año hasta ese trimestre (el de Q4 es el % del año; null = N/D: hubo
//     gasto antes de registrar ingresos).
//   · Donaciones en especie y beneficio (SUPPLY + BENEFIT): columna informativa;
//     no suman al ingreso.
// Se excluyen proyectos eliminados (soft delete). Cada año con movimientos
// muestra sus 4 trimestres, aunque alguno venga en cero.
const SQL = `
  WITH proj AS (
    SELECT id FROM caderh.projects WHERE project_status <> 'DELETED'
  ),
  ingresos AS (
    SELECT EXTRACT(YEAR FROM fecha)::int AS year, EXTRACT(QUARTER FROM fecha)::int AS quarter,
           SUM(amount)::bigint AS cents
    FROM (
      SELECT pfs.disbursement_date AS fecha, pfs.amount
      FROM caderh.project_financing_sources pfs JOIN proj ON proj.id = pfs.project_id
      UNION ALL
      SELECT pd.disbursement_date, pd.amount
      FROM caderh.project_donations pd JOIN proj ON proj.id = pd.project_id
      WHERE pd.donation_type = 'CASH'
    ) x
    GROUP BY 1, 2
  ),
  gastos AS (
    SELECT EXTRACT(YEAR FROM pe.expense_date)::int AS year, EXTRACT(QUARTER FROM pe.expense_date)::int AS quarter,
           SUM(pe.amount)::bigint AS cents
    FROM caderh.project_expenses pe
    JOIN proj ON proj.id = pe.project_id
    LEFT JOIN caderh.project_donations pdo ON pdo.id = pe.project_donation_id
    WHERE pe.project_donation_id IS NULL OR pdo.donation_type = 'CASH'
    GROUP BY 1, 2
  ),
  especie AS (
    SELECT EXTRACT(YEAR FROM pd.disbursement_date)::int AS year, EXTRACT(QUARTER FROM pd.disbursement_date)::int AS quarter,
           SUM(pd.amount)::bigint AS cents
    FROM caderh.project_donations pd JOIN proj ON proj.id = pd.project_id
    WHERE pd.donation_type IN ('SUPPLY', 'BENEFIT')
    GROUP BY 1, 2
  ),
  periodos AS (
    SELECT a.year, q.quarter
    FROM (SELECT year FROM ingresos UNION SELECT year FROM gastos UNION SELECT year FROM especie) a
    CROSS JOIN generate_series(1, 4) AS q(quarter)
    WHERE $1::int IS NULL OR a.year = $1
  )
  SELECT
    pr.year, pr.quarter,
    COALESCE(i.cents, 0)::bigint AS ingresos_cents,
    COALESCE(g.cents, 0)::bigint AS gastos_cents,
    COALESCE(e.cents, 0)::bigint AS especie_cents,
    SUM(COALESCE(i.cents, 0)) OVER w AS ingresos_acum_cents,
    SUM(COALESCE(g.cents, 0)) OVER w AS gastos_acum_cents
  FROM periodos pr
  LEFT JOIN ingresos i ON i.year = pr.year AND i.quarter = pr.quarter
  LEFT JOIN gastos   g ON g.year = pr.year AND g.quarter = pr.quarter
  LEFT JOIN especie  e ON e.year = pr.year AND e.quarter = pr.quarter
  WINDOW w AS (PARTITION BY pr.year ORDER BY pr.quarter)
  ORDER BY pr.year DESC, pr.quarter ASC
`;

// % de ejecución (fórmula oficial CADERH: gasto en efectivo ÷ ingreso en
// efectivo × 100, sin tope). null = N/D: hay gasto pero aún no hay ingreso.
const pctEjecucion = (gastosCents, ingresosCents) => {
  if (ingresosCents > 0) return (gastosCents / ingresosCents) * 100;
  return gastosCents > 0 ? null : 0;
};

export const handler = reportHandler(async (req) => {
  const year = req.query.year ? parseInt(req.query.year, 10) : null;
  const [rows] = await sequelize.query(SQL, { bind: [year] });

  const out = rows.map((r) => ({
    year: r.year,
    quarter: `Q${r.quarter}`,
    ingresos: centsToLmps(r.ingresos_cents),
    gastos: centsToLmps(r.gastos_cents),
    pctEjecucionAcumulado: pctEjecucion(Number(r.gastos_acum_cents), Number(r.ingresos_acum_cents)),
    donacionesEspecieBeneficio: centsToLmps(r.especie_cents),
  }));

  // Totales en centavos para no arrastrar redondeos de punto flotante.
  const sumCents = (key) => rows.reduce((s, r) => s + Number(r[key]), 0);
  const ingresosCents = sumCents('ingresos_cents');
  const gastosCents = sumCents('gastos_cents');
  const especieCents = sumCents('especie_cents');
  const pctPeriodo = pctEjecucion(gastosCents, ingresosCents);

  return {
    rows: out,
    total: out.length,
    kpis: {
      ingresoPeriodo: centsToLmps(ingresosCents),
      gastosPeriodo: centsToLmps(gastosCents),
      pctEjecucionGlobal: pctPeriodo,
      donacionesEspecieBeneficio: centsToLmps(especieCents),
    },
    totals: {
      ingresos: centsToLmps(ingresosCents),
      gastos: centsToLmps(gastosCents),
      pctEjecucionAcumulado: pctPeriodo,
      donacionesEspecieBeneficio: centsToLmps(especieCents),
    },
  };
});
