import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, parsePagination } from '../shared.js';

// R4: Egresados + estatus derivado. KPIs: conteos por cada estatus.

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
    eg.lugar_trabajo                          AS donde_trabaja
  FROM centros.egresados eg
  JOIN centros.estudiantes e             ON e.id = eg.estudiante_id
  JOIN centros.proceso_matriculas pm     ON pm.estudiante_id = e.id
  JOIN centros.procesos proc             ON proc.id = pm.proceso_id
  JOIN centros.centros c                 ON c.id = proc.centro_id
  JOIN centros.cursos cu                 ON cu.id = proc.curso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  LEFT JOIN caderh.projects pro          ON pro.id = pp.project_id
  WHERE ($1::uuid[] IS NULL OR pro.id = ANY($1::uuid[]))
    AND ($2::text IS NULL OR
         ($2 = 'Pasantía'     AND eg.practica_profesional = 1) OR
         ($2 = 'Emprendiendo' AND eg.autoempleo           = 1) OR
         ($2 = 'Trabajando'   AND eg.trabaja_actualmente  = 1) OR
         ($2 = 'Estudiando'   AND eg.estudiando           = 1)
    )
  ORDER BY e.apellidos, e.nombres
  LIMIT $3 OFFSET $4
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
  WHERE ($1::uuid[] IS NULL OR pp.project_id = ANY($1::uuid[]))
`;

export const handler = reportHandler(async (req) => {
  const rawProject = req.query.project;
  const projectUuids = !rawProject ? null
    : (Array.isArray(rawProject) ? rawProject : String(rawProject).split(','))
        .map((s) => String(s).trim()).filter(Boolean);
  const estatus = req.query.estatus ? String(req.query.estatus) : null;
  const { pageSize, offset } = parsePagination(req.query);

  const [rows] = await sequelize.query(SQL, {
    bind: [projectUuids, estatus, pageSize, offset],
  });
  const [kpiRows] = await sequelize.query(KPI_SQL, { bind: [projectUuids] });
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
    meta: { missingColumns: ['puesto', 'rangoSalario', 'montoKit', 'empresa'] },
  };
});
