import { Router } from "express";
import { sequelize } from "../../utils/sequelize.js";
import { verify_token, is_authenticated } from "../../utils/token.js";

export const router = Router();

// GET /stats/dashboard?year=<YYYY|all>
//
// Filtro de año (bind $1: int o NULL = histórico; default = año actual):
//   - Fuentes y donaciones: disbursement_date (NOT NULL desde la recaptura)
//   - Gastos: expense_date (fecha de negocio; created_dt es solo captura)
//   - Matrícula/procesos: año de centros.procesos.fecha_inicial
// Exclusiones globales: proyectos DELETED y registros SGC con estatus = 0.
// "proyectosActivos" cuenta solo project_status = 'ACTIVE', y
// "ejecucionPorProyecto" es acumulado por proyecto ACTIVE (sin filtro de año).

// ─── Formación ───────────────────────────────────────────────────────────────

const FORMACION_KPIS_SQL = `
  SELECT
    (SELECT COUNT(DISTINCT pm.estudiante_id)
       FROM centros.proceso_matriculas pm
       JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1
      WHERE pm.estatus = 1
        AND ($1::int IS NULL OR EXTRACT(YEAR FROM proc.fecha_inicial) = $1))::int AS estudiantes,
    -- Base de la tendencia: mismo cálculo para year-1 (solo aplica con año concreto).
    (SELECT COUNT(DISTINCT pm.estudiante_id)
       FROM centros.proceso_matriculas pm
       JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1
      WHERE pm.estatus = 1
        AND $1::int IS NOT NULL
        AND EXTRACT(YEAR FROM proc.fecha_inicial) = $1 - 1)::int AS estudiantes_prev,
    (SELECT COUNT(*)
       FROM centros.procesos p
      WHERE p.estatus = 1
        AND ($1::int IS NULL OR EXTRACT(YEAR FROM p.fecha_inicial) = $1))::int AS procesos_impartidos,
    -- Procesos en curso: SIEMPRE "hoy", independiente del filtro de año.
    (SELECT COUNT(*)
       FROM centros.procesos p
      WHERE p.estatus = 1
        AND p.cancelado = false
        AND p.fecha_inicial <= CURRENT_DATE
        AND p.fecha_final  >= CURRENT_DATE)::int AS procesos_en_curso,
    -- Centros/instructores activos: estado actual, independiente del año.
    (SELECT COUNT(*) FROM centros.centros     c WHERE c.estatus = 1)::int AS centros_activos,
    (SELECT COUNT(*) FROM centros.instructors i WHERE i.estatus = 1)::int AS instructores_activos
`;

// 12 buckets: Ene..Dic del año pedido, o los últimos 12 meses si es histórico.
// Sexo normalizado con UPPER(LEFT(TRIM(...),1)) — cubre el canónico 'M'/'F'
// post-recaptura y las variantes heredadas 'Masculino'/'Femenino'.
const MATRICULA_MENSUAL_SQL = `
  WITH months AS (
    SELECT (CASE
              WHEN $1::int IS NULL
                THEN date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (11 - g)
              ELSE make_date($1::int, 1, 1)::timestamp + INTERVAL '1 month' * g
            END)::date AS month_start
    FROM generate_series(0, 11) AS g
  ),
  mat AS (
    SELECT
      date_trunc('month', proc.fecha_inicial)::date AS m,
      COUNT(*) FILTER (WHERE UPPER(LEFT(TRIM(COALESCE(e.sexo, '')), 1)) = 'M')::int AS hombres,
      COUNT(*) FILTER (WHERE UPPER(LEFT(TRIM(COALESCE(e.sexo, '')), 1)) = 'F')::int AS mujeres
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1
    JOIN centros.estudiantes e ON e.id = pm.estudiante_id
    WHERE pm.estatus = 1
    GROUP BY 1
  )
  SELECT
    months.month_start,
    EXTRACT(MONTH FROM months.month_start)::int AS month_num,
    EXTRACT(YEAR  FROM months.month_start)::int AS year_num,
    COALESCE(mat.hombres, 0) AS hombres,
    COALESCE(mat.mujeres, 0) AS mujeres
  FROM months
  LEFT JOIN mat ON mat.m = months.month_start
  ORDER BY months.month_start ASC
`;

// Top 8 áreas técnicas por matrícula del año (vía junction curso_areas).
const MATRICULA_AREA_SQL = `
  SELECT a.nombre AS area, COUNT(*)::int AS total
  FROM centros.proceso_matriculas pm
  JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1
  JOIN centros.curso_areas ca  ON ca.curso_id = proc.curso_id
  JOIN centros.areas a         ON a.id = ca.area_id AND a.estatus = 1
  WHERE pm.estatus = 1
    AND ($1::int IS NULL OR EXTRACT(YEAR FROM proc.fecha_inicial) = $1)
  GROUP BY a.nombre
  ORDER BY total DESC, a.nombre ASC
  LIMIT 8
`;

// ─── Finanzas ────────────────────────────────────────────────────────────────

// Criterio CADERH (igual que el header del proyecto y R6): solo el efectivo
// suma. Ingresos recibidos = fuentes + donaciones CASH; gastos = gastos en
// efectivo (generales, contra fuente o contra donación CASH). Las donaciones
// en suministros/beneficios y los gastos imputados a ellas no entran; las
// donaciones por tipo se siguen viendo en el donut.
const FINANZAS_KPIS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM caderh.projects WHERE project_status = 'ACTIVE')::int AS proyectos_activos
`;

// % de ejecución financiera oficial (misma técnica que CASH_EXECUTION_SQL de
// r7-ingreso-consolidado.js): gastos en efectivo ÷ ingresos en efectivo, donde
// ingresos en efectivo = fuentes + donaciones CASH y gasto en efectivo = no
// imputado a una donación o imputado a una donación CASH. Sus dos cifras son
// también los KPIs "Ingresos Recibidos" y "Gastos".
const CASH_EXECUTION_SQL = `
  SELECT
    (
      COALESCE((SELECT SUM(pfs.amount) FROM caderh.project_financing_sources pfs
        JOIN caderh.projects p ON p.id = pfs.project_id AND p.project_status <> 'DELETED'
        WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM pfs.disbursement_date) = $1)), 0)
      +
      COALESCE((SELECT SUM(pd.amount) FROM caderh.project_donations pd
        JOIN caderh.projects p ON p.id = pd.project_id AND p.project_status <> 'DELETED'
        WHERE pd.donation_type = 'CASH'
          AND ($1::int IS NULL OR EXTRACT(YEAR FROM pd.disbursement_date) = $1)), 0)
    )::bigint AS ingresos_efectivo_cents,
    COALESCE((SELECT SUM(pe.amount) FROM caderh.project_expenses pe
      JOIN caderh.projects p ON p.id = pe.project_id AND p.project_status <> 'DELETED'
      LEFT JOIN caderh.project_donations pdo ON pdo.id = pe.project_donation_id
      WHERE (pe.project_donation_id IS NULL OR pdo.donation_type = 'CASH')
        AND ($1::int IS NULL OR EXTRACT(YEAR FROM pe.expense_date) = $1)), 0)::bigint AS gastos_efectivo_cents
`;

// 12 buckets mensuales (mismo criterio de months que la matrícula).
// Ingresos = fuentes + donaciones CASH (por disbursement_date); gastos en
// efectivo por expense_date (fecha de negocio).
const FINANZAS_MENSUAL_SQL = `
  WITH months AS (
    SELECT (CASE
              WHEN $1::int IS NULL
                THEN date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' * (11 - g)
              ELSE make_date($1::int, 1, 1)::timestamp + INTERVAL '1 month' * g
            END)::date AS month_start
    FROM generate_series(0, 11) AS g
  ),
  fin AS (
    SELECT date_trunc('month', pfs.disbursement_date)::date AS m,
           SUM(pfs.amount)::bigint AS cents
    FROM caderh.project_financing_sources pfs
    JOIN caderh.projects p ON p.id = pfs.project_id AND p.project_status <> 'DELETED'
    GROUP BY 1
  ),
  don AS (
    SELECT date_trunc('month', pd.disbursement_date)::date AS m,
           SUM(pd.amount)::bigint AS cents
    FROM caderh.project_donations pd
    JOIN caderh.projects p ON p.id = pd.project_id AND p.project_status <> 'DELETED'
    WHERE pd.donation_type = 'CASH'
    GROUP BY 1
  ),
  exp AS (
    SELECT date_trunc('month', pe.expense_date)::date AS m,
           SUM(pe.amount)::bigint AS cents
    FROM caderh.project_expenses pe
    JOIN caderh.projects p ON p.id = pe.project_id AND p.project_status <> 'DELETED'
    LEFT JOIN caderh.project_donations pdo ON pdo.id = pe.project_donation_id
    WHERE pe.project_donation_id IS NULL OR pdo.donation_type = 'CASH'
    GROUP BY 1
  )
  SELECT
    months.month_start,
    EXTRACT(MONTH FROM months.month_start)::int AS month_num,
    EXTRACT(YEAR  FROM months.month_start)::int AS year_num,
    (COALESCE(fin.cents, 0) + COALESCE(don.cents, 0))::bigint AS ingresos_cents,
    COALESCE(exp.cents, 0)::bigint AS gastos_cents
  FROM months
  LEFT JOIN fin ON fin.m = months.month_start
  LEFT JOIN don ON don.m = months.month_start
  LEFT JOIN exp ON exp.m = months.month_start
  ORDER BY months.month_start ASC
`;

const POR_FUENTE_SQL = `
  SELECT fs.name, SUM(pfs.amount)::bigint AS total_cents
  FROM caderh.project_financing_sources pfs
  JOIN caderh.financing_sources fs ON fs.id = pfs.financing_source_id
  JOIN caderh.projects p ON p.id = pfs.project_id AND p.project_status <> 'DELETED'
  WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM pfs.disbursement_date) = $1)
  GROUP BY fs.name
  ORDER BY total_cents DESC
`;

const POR_TIPO_SQL = `
  SELECT pd.donation_type, SUM(pd.amount)::bigint AS total_cents
  FROM caderh.project_donations pd
  JOIN caderh.projects p ON p.id = pd.project_id AND p.project_status <> 'DELETED'
  WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM pd.disbursement_date) = $1)
  GROUP BY pd.donation_type
`;

// Ejecución acumulada por proyecto (SIN filtro de año, documentado en el
// frontend): top 8 por ingresos en efectivo, solo proyectos ACTIVE con
// ingresos > 0, fórmula oficial de efectivo, % real sin tope.
const EJECUCION_SQL = `
  SELECT * FROM (
    SELECT
      p.name,
      (
        COALESCE((SELECT SUM(amount) FROM caderh.project_financing_sources WHERE project_id = p.id), 0) +
        COALESCE((SELECT SUM(amount) FROM caderh.project_donations WHERE project_id = p.id AND donation_type = 'CASH'), 0)
      )::bigint AS ingresos_cents,
      COALESCE((
        SELECT SUM(pe.amount) FROM caderh.project_expenses pe
        LEFT JOIN caderh.project_donations pd ON pd.id = pe.project_donation_id
        WHERE pe.project_id = p.id
          AND (pe.project_donation_id IS NULL OR pd.donation_type = 'CASH')
      ), 0)::bigint AS gastos_cents
    FROM caderh.projects p
    WHERE p.project_status = 'ACTIVE'
  ) t
  WHERE t.ingresos_cents > 0
  ORDER BY t.ingresos_cents DESC
  LIMIT 8
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const DONATION_TYPE_LABELS = {
    CASH: "Efectivo",
    SUPPLY: "Especie",
    BENEFIT: "Beneficio",
};

const centsToLmps = (cents) => Number(cents ?? 0) / 100;

// Variación % vs el período base; null si no hay base de comparación.
const trendPct = (current, previous) =>
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

const round1 = (n) => Math.round(n * 10) / 10;

// Dashboard de estadísticas (página home del frontend): una sola respuesta
// con las secciones Formación y Finanzas de Proyectos.
router.get('/dashboard', verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            // year: 'all' (histórico), YYYY de 4 dígitos, o default = año actual.
            // Se valida con regex y viaja como bind $1 — nunca se interpola.
            const rawYear = req.query.year;
            let year = new Date().getFullYear();
            if (typeof rawYear === 'string' && rawYear.trim() !== '') {
                const s = rawYear.trim().toLowerCase();
                if (s === 'all') year = null;
                else if (/^\d{4}$/.test(s)) year = parseInt(s, 10);
            }
            const isAll = year === null;
            const bind = [year];

            const [
                [formacionKpisRows],
                [matriculaMesRows],
                [matriculaAreaRows],
                [finanzasKpisRows],
                [cashExecRows],
                [finanzasMesRows],
                [fuenteRows],
                [tipoRows],
                [ejecucionRows],
            ] = await Promise.all([
                sequelize.query(FORMACION_KPIS_SQL, { bind }),
                sequelize.query(MATRICULA_MENSUAL_SQL, { bind }),
                sequelize.query(MATRICULA_AREA_SQL, { bind }),
                sequelize.query(FINANZAS_KPIS_SQL),
                sequelize.query(CASH_EXECUTION_SQL, { bind }),
                sequelize.query(FINANZAS_MENSUAL_SQL, { bind }),
                sequelize.query(POR_FUENTE_SQL, { bind }),
                sequelize.query(POR_TIPO_SQL, { bind }),
                sequelize.query(EJECUCION_SQL),
            ]);

            // Con año concreto basta el nombre del mes; en histórico (últimos 12
            // meses) se agrega el año corto porque la ventana cruza dos años.
            const mesLabel = (r) => {
                const base = MES_LABELS[Number(r.month_num) - 1] ?? String(r.month_num);
                return isAll ? `${base} ${String(r.year_num).slice(-2)}` : base;
            };

            const fk = formacionKpisRows[0] ?? {};
            const estudiantes = Number(fk.estudiantes ?? 0);
            const estudiantesPrev = Number(fk.estudiantes_prev ?? 0);

            const formacion = {
                estudiantesMatriculados: estudiantes,
                estudiantesTrend: isAll ? null : trendPct(estudiantes, estudiantesPrev),
                procesosImpartidos: Number(fk.procesos_impartidos ?? 0),
                procesosEnCurso: Number(fk.procesos_en_curso ?? 0),
                centrosActivos: Number(fk.centros_activos ?? 0),
                instructoresActivos: Number(fk.instructores_activos ?? 0),
                matriculaPorMes: matriculaMesRows.map((r) => ({
                    mes: mesLabel(r),
                    hombres: Number(r.hombres ?? 0),
                    mujeres: Number(r.mujeres ?? 0),
                })),
                matriculaPorArea: matriculaAreaRows.map((r) => ({
                    area: r.area,
                    total: Number(r.total ?? 0),
                })),
            };

            const kk = finanzasKpisRows[0] ?? {};
            const cash = cashExecRows[0] ?? {};
            const ingresosEfectivo = centsToLmps(cash.ingresos_efectivo_cents);
            const gastosEfectivo = centsToLmps(cash.gastos_efectivo_cents);

            const finanzas = {
                proyectosActivos: Number(kk.proyectos_activos ?? 0),
                ingresosRecibidos: ingresosEfectivo,
                gastos: gastosEfectivo,
                // 1 decimal, sin tope; null si no hay ingresos en efectivo.
                pctEjecucion: ingresosEfectivo > 0
                    ? round1((gastosEfectivo / ingresosEfectivo) * 100)
                    : null,
                ingresosVsGastosMensual: finanzasMesRows.map((r) => ({
                    mes: mesLabel(r),
                    ingresos: centsToLmps(r.ingresos_cents),
                    gastos: centsToLmps(r.gastos_cents),
                })),
                ejecucionPorProyecto: ejecucionRows.map((r) => {
                    const ingresos = centsToLmps(r.ingresos_cents);
                    const gastos = centsToLmps(r.gastos_cents);
                    // Sin tope: puede superar 100 si se gastó más de lo ingresado.
                    const pct = ingresos > 0 ? round1((gastos / ingresos) * 100) : 0;
                    return { nombre: r.name, pct };
                }),
                financiamientoPorFuente: fuenteRows.map((r) => ({
                    name: r.name,
                    total: centsToLmps(r.total_cents),
                })),
                donacionesPorTipo: tipoRows
                    .map((r) => ({
                        tipo: DONATION_TYPE_LABELS[r.donation_type] ?? r.donation_type,
                        total: centsToLmps(r.total_cents),
                    }))
                    .filter((d) => d.total > 0),
            };

            res.status(200).json({ data: { formacion, finanzas } });
        } catch (e) {
            next(e);
        }
    }
);
