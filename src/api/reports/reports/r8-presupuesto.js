import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, parseUuidList, parseIsoDate } from '../shared.js';

// R8 · Presupuesto ejecutado vs programado.
//
// Una fila por proyecto con las mismas cifras del encabezado del proyecto
// (criterio CADERH: solo el efectivo suma al presupuesto; misma definición que
// project_finance_attributes() en supervisor.api.js):
//   · Programado = Presupuesto General = fuentes de financiamiento + donaciones
//     en efectivo.
//   · Ejecutado = Presupuesto Ejecutado = gastos generales, contra una fuente o
//     contra una donación en efectivo (lo imputado a suministros o beneficios se
//     rebaja de esas donaciones y no cuenta aquí).
//   · Saldo disponible = programado − ejecutado (mínimo 0); Sobre ejecución =
//     lo que el ejecutado supera al programado.
//   · % de ejecución = ejecutado ÷ programado × 100, sin tope; null si hay gasto
//     sin presupuesto (N/D, como en el encabezado).
//
// Filtros: project, corte (por defecto hoy): ingresos por fecha de desembolso y
// gastos por fecha del gasto hasta el corte. Al corte de hoy las cifras son las
// del encabezado del proyecto. Se excluyen los proyectos eliminados.

const SQL = `
  SELECT
    p.id   AS project_id,
    p.name AS project_name,
    (COALESCE((SELECT SUM(pfs.amount) FROM caderh.project_financing_sources pfs
                WHERE pfs.project_id = p.id
                  AND pfs.disbursement_date <= $2::date), 0)
     + COALESCE((SELECT SUM(pd.amount) FROM caderh.project_donations pd
                  WHERE pd.project_id = p.id AND pd.donation_type = 'CASH'
                    AND pd.disbursement_date <= $2::date), 0))::bigint AS programado_cents,
    COALESCE((SELECT SUM(pe.amount) FROM caderh.project_expenses pe
               LEFT JOIN caderh.project_donations pd ON pd.id = pe.project_donation_id
              WHERE pe.project_id = p.id
                AND (pe.project_donation_id IS NULL OR pd.donation_type = 'CASH')
                AND pe.expense_date <= $2::date), 0)::bigint AS ejecutado_cents
  FROM caderh.projects p
  WHERE p.project_status <> 'DELETED'
    AND ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ORDER BY p.name
`;

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const pct = (ejecutado, programado) => {
  if (programado > 0) return Math.round((ejecutado / programado) * 1000) / 10;
  return ejecutado > 0 ? null : 0;
};

export const handler = reportHandler(async (req) => {
  const q = req.query;
  const corte = parseIsoDate(q.corte) ?? hoyIso();
  const [rows] = await sequelize.query(SQL, { bind: [parseUuidList(q.project), corte] });

  // Cálculos en centavos para no acumular error de redondeo.
  const filas = rows.map((r) => {
    const p = Number(r.programado_cents);
    const e = Number(r.ejecutado_cents);
    return { r, p, e, saldo: Math.max(0, p - e), sobre: e > p ? e - p : 0 };
  });

  const out = filas.map(({ r, p, e, saldo, sobre }) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    programado: p / 100,
    ejecutado: e / 100,
    saldo: saldo / 100,
    sobreEjecucion: sobre > 0 ? sobre / 100 : null,
    pctEjecucion: pct(e, p),
  }));

  const sum = (k) => filas.reduce((s, f) => s + f[k], 0);
  const totalP = sum('p');
  const totalE = sum('e');
  const totalSobre = sum('sobre');

  return {
    rows: out,
    total: out.length,
    totals: {
      programado: totalP / 100,
      ejecutado: totalE / 100,
      saldo: sum('saldo') / 100,
      sobreEjecucion: totalSobre > 0 ? totalSobre / 100 : null,
      pctEjecucion: pct(totalE, totalP),
    },
    kpis: {
      programado: totalP / 100,
      ejecutado: totalE / 100,
      saldo: sum('saldo') / 100,
      pctEjecucion: pct(totalE, totalP) ?? 0,
    },
    meta: { corte },
  };
});
