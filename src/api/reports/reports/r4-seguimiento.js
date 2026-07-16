import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, parsePagination } from '../shared.js';

// R4: Egresados + estatus derivado. KPIs: conteos por cada estatus.
// Filtros: project, cftp (centro vía proceso), financingSource (vía proyecto),
// technicalArea (vía centros.curso_areas), year (EXTRACT de proc.fecha_inicial),
// estatus — mismo patrón de binds que r2-listado-jovenes.js.
//
// Esquema post-recaptura: 'Emprendiendo' sale de eg.autoempleo (dato de
// SEGUIMIENTO capturado en el egreso, no de estudiantes.autoempleo que es un
// dato de inscripción). puesto y rango_salario ya existen en centros.egresados
// y se exponen como datos reales.

const FILTER_WHERE = `
  WHERE ($1::uuid[] IS NULL OR pp.project_id = ANY($1::uuid[]))
    AND ($2::int[]  IS NULL OR proc.centro_id = ANY($2::int[]))
    AND ($3::uuid[] IS NULL OR EXISTS (
          SELECT 1 FROM caderh.project_financing_sources pfs
          WHERE pfs.project_id = pp.project_id
            AND pfs.financing_source_id = ANY($3::uuid[])
        ))
    AND ($4::int[] IS NULL OR EXISTS (
          SELECT 1 FROM centros.curso_areas ca
          WHERE ca.curso_id = proc.curso_id
            AND ca.area_id = ANY($4::int[])
        ))
    AND ($5::int IS NULL OR EXTRACT(YEAR FROM proc.fecha_inicial) = $5)
`;

const SQL = `
  SELECT
    ROW_NUMBER() OVER (ORDER BY e.apellidos, e.nombres)::int AS num,
    CONCAT(e.nombres, ' ', e.apellidos)       AS nombre_completo,
    e.identidad                               AS dni,
    cu.nombre                                 AS curso,
    c.nombre                                  AS centro,
    pro.name                                  AS proyecto,
    CASE
      WHEN eg.practica_profesional = 1 THEN 'Pasantía'
      WHEN eg.autoempleo           = 1 THEN 'Emprendiendo'
      WHEN eg.trabaja_actualmente  = 1 THEN 'Trabajando'
      WHEN eg.estudiando           = 1 THEN 'Estudiando'
      ELSE 'No aplica'
    END                                       AS estatus,
    eg.lugar_trabajo                          AS donde_trabaja,
    eg.puesto                                 AS puesto,
    eg.rango_salario                          AS rango_salario
  FROM centros.egresados eg
  JOIN centros.estudiantes e             ON e.id = eg.estudiante_id
  JOIN centros.proceso_matriculas pm     ON pm.estudiante_id = e.id
  JOIN centros.procesos proc             ON proc.id = pm.proceso_id
  JOIN centros.centros c                 ON c.id = proc.centro_id
  JOIN centros.cursos cu                 ON cu.id = proc.curso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  LEFT JOIN caderh.projects pro          ON pro.id = pp.project_id
  ${FILTER_WHERE}
    AND ($6::text IS NULL OR
         ($6 = 'Pasantía'     AND eg.practica_profesional = 1) OR
         ($6 = 'Emprendiendo' AND eg.autoempleo           = 1) OR
         ($6 = 'Trabajando'   AND eg.trabaja_actualmente  = 1) OR
         ($6 = 'Estudiando'   AND eg.estudiando           = 1)
    )
  ORDER BY e.apellidos, e.nombres
  LIMIT $7 OFFSET $8
`;

const KPI_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE eg.practica_profesional = 1)::int AS pasantia,
    COUNT(*) FILTER (WHERE eg.trabaja_actualmente  = 1)::int AS trabajando,
    COUNT(*) FILTER (WHERE eg.autoempleo           = 1)::int AS emprendiendo,
    COUNT(*) FILTER (WHERE eg.estudiando           = 1)::int AS estudiando,
    COUNT(*)::int                                            AS total
  FROM centros.egresados eg
  JOIN centros.estudiantes e ON e.id = eg.estudiante_id
  JOIN centros.proceso_matriculas pm ON pm.estudiante_id = e.id
  JOIN centros.procesos proc ON proc.id = pm.proceso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  ${FILTER_WHERE}
`;

function parseUuids(raw) {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function parseInts(raw) {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((s) => parseInt(String(s).trim(), 10))
    .filter(Number.isFinite);
}

function parseInt1(raw) {
  if (!raw) return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export const handler = reportHandler(async (req) => {
  const projectUuids     = parseUuids(req.query.project);
  const centroIds        = parseInts(req.query.cftp);
  const financingUuids   = parseUuids(req.query.financingSource);
  const technicalAreaIds = parseInts(req.query.technicalArea);
  const year             = parseInt1(req.query.year);
  const estatus = req.query.estatus ? String(req.query.estatus) : null;
  const { pageSize, offset } = parsePagination(req.query);

  const filterBinds = [
    projectUuids,     // $1
    centroIds,        // $2
    financingUuids,   // $3
    technicalAreaIds, // $4
    year,             // $5
  ];

  const [rows] = await sequelize.query(SQL, {
    bind: [...filterBinds, estatus, pageSize, offset],
  });
  const [kpiRows] = await sequelize.query(KPI_SQL, { bind: filterBinds });
  const k = kpiRows[0] ?? { pasantia: 0, trabajando: 0, emprendiendo: 0, estudiando: 0, total: 0 };

  return {
    rows,
    total: k.total,
    kpis: {
      pasantia: k.pasantia,
      trabajando: k.trabajando,
      emprendiendo: k.emprendiendo,
      estudiando: k.estudiando,
    },
    // puesto y rango_salario ya son columnas reales de centros.egresados.
    meta: { missingColumns: ['montoKit', 'empresa'] },
  };
});
