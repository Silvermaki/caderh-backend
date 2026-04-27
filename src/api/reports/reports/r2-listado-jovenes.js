import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, parsePagination } from '../shared.js';

// R2: Listado detallado de jóvenes (paged).
//
// Schema verified from migrations/1770760000000_caderh_sgc_tables.sql:
//   - telefono_celular does NOT exist; columns are `celular` and `telefono`
//   - con_quien_vive does NOT exist; column is `vive`
//   - discapacidad does NOT exist; column is `discapacidad_id` (TEXT)
//   - tiene_hijos exists as INTEGER (0/1)
//   - estado_civil exists (made nullable in later migration)
//   - email exists
//   - autoempleo, trabajo_actual, donde_trabaja, estudia all exist
//   - centros.procesos has centro_id (used in COUNT_SQL)

const SQL = `
  SELECT
    ROW_NUMBER() OVER (ORDER BY e.apellidos, e.nombres)::int AS num,
    c.nombre                                    AS centro,
    cu.nombre                                   AS curso,
    CONCAT(e.nombres, ' ', e.apellidos)         AS nombre_completo,
    e.identidad                                 AS dni,
    e.fecha_nacimiento                          AS fecha_nacimiento,
    CASE WHEN e.fecha_nacimiento IS NOT NULL
      THEN EXTRACT(YEAR FROM age(CURRENT_DATE, e.fecha_nacimiento::date))::int
      ELSE NULL END                             AS edad,
    e.sexo                                      AS sexo,
    e.estado_civil                              AS estado_civil,
    e.celular                                   AS telefono_celular,
    e.email                                     AS correo,
    d.nombre                                    AS departamento,
    e.direccion                                 AS direccion,
    e.vive                                      AS con_quien_vive,
    e.tiene_hijos                               AS tiene_hijos,
    e.discapacidad_id                           AS discapacidad,
    e.trabajo_actual                            AS trabajo_actual,
    e.donde_trabaja                             AS donde_trabaja,
    e.estudia                                   AS estudia,
    e.autoempleo                                AS autoempleo
  FROM centros.estudiantes e
  JOIN centros.centros c              ON c.id = e.centro_id
  LEFT JOIN centros.departamentos d   ON d.id = e.departamento_id
  JOIN centros.proceso_matriculas pm  ON pm.estudiante_id = e.id
  JOIN centros.procesos proc          ON proc.id = pm.proceso_id
  JOIN centros.cursos cu              ON cu.id = proc.curso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  WHERE ($1::uuid[] IS NULL OR pp.project_id = ANY($1::uuid[]))
    AND ($2::int[] IS NULL OR c.id = ANY($2::int[]))
    AND pm.estatus = 1
  ORDER BY e.apellidos, e.nombres
  LIMIT $3 OFFSET $4
`;

const COUNT_SQL = `
  SELECT COUNT(DISTINCT e.id)::int AS total
  FROM centros.estudiantes e
  JOIN centros.proceso_matriculas pm ON pm.estudiante_id = e.id
  JOIN centros.procesos proc          ON proc.id = pm.proceso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  WHERE ($1::uuid[] IS NULL OR pp.project_id = ANY($1::uuid[]))
    AND ($2::int[] IS NULL OR proc.centro_id = ANY($2::int[]))
    AND pm.estatus = 1
`;

export const handler = reportHandler(async (req) => {
  const rawProject = req.query.project;
  const projectUuids = !rawProject ? null
    : (Array.isArray(rawProject) ? rawProject : String(rawProject).split(','))
        .map((s) => String(s).trim()).filter(Boolean);

  const rawCftp = req.query.cftp;
  const centroIds = !rawCftp ? null
    : (Array.isArray(rawCftp) ? rawCftp : String(rawCftp).split(','))
        .map((s) => parseInt(String(s).trim(), 10))
        .filter(Number.isFinite);

  const { pageSize, offset } = parsePagination(req.query);

  const [rows] = await sequelize.query(SQL, {
    bind: [projectUuids, centroIds, pageSize, offset],
  });
  const [countRows] = await sequelize.query(COUNT_SQL, {
    bind: [projectUuids, centroIds],
  });

  return {
    rows,
    total: countRows[0]?.total ?? 0,
    meta: {
      missingColumns: [
        'tipoContratacion', 'beneficiosLaborales', 'fechaIngresoLaboral',
        'nombreEmprendimiento', 'rubroEmprendimiento', 'antiguedadEmprendimiento',
        'ingresoMensualFamiliar', 'facebookInstagram', 'migranteRetornado',
        'puestoActual', 'rangoSalario',
      ],
    },
  };
});
