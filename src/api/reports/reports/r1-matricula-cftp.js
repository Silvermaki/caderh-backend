import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler } from '../shared.js';

// R1: Matrícula por CFTP. Filas agregadas por (proyecto, ciudad, centro, curso, área).
// Totales H/M, Formación Normal/Dual, Total — el frontend agrupa jerárquicamente.
//
// Schema notes verified from migrations:
//   - centros.cursos has NO area_id; areas linked via centros.curso_areas (junction)
//   - centros.procesos.metodologia_id -> centros.metodologias (not sgc_metodologias)
//   - caderh.projects_processes links process_id (int) -> project_id (uuid)
//   - centros.estudiantes.sexo is TEXT NOT NULL (no CHECK constraint; values vary)

const SQL = `
  WITH matricula AS (
    SELECT
      pro.id                              AS project_id,
      pro.name                            AS project_name,
      mun.nombre                          AS ciudad,
      c.id                                AS centro_id,
      c.nombre                            AS centro_name,
      c.siglas                            AS centro_siglas,
      cu.id                               AS curso_id,
      cu.nombre                           AS curso_name,
      a.nombre                            AS area_tecnica,
      pm.estudiante_id                    AS estudiante_id,
      e.sexo                              AS sexo,
      COALESCE(tm.nombre, 'Normal')       AS tipo_formacion
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc            ON proc.id = pm.proceso_id
    JOIN centros.centros c                ON c.id = proc.centro_id
    LEFT JOIN centros.municipios mun      ON mun.id = c.municipio_id
    JOIN centros.cursos cu                ON cu.id = proc.curso_id
    LEFT JOIN centros.curso_areas ca      ON ca.curso_id = cu.id
    LEFT JOIN centros.areas a             ON a.id = ca.area_id
    JOIN centros.estudiantes e            ON e.id = pm.estudiante_id
    LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
    LEFT JOIN caderh.projects pro         ON pro.id = pp.project_id
    LEFT JOIN centros.metodologias tm     ON tm.id = proc.metodologia_id
    WHERE pm.estatus = 1
      AND ($1::uuid[] IS NULL OR pro.id = ANY($1::uuid[]))
      AND ($2::int[] IS NULL OR c.id = ANY($2::int[]))
  )
  SELECT
    project_name,
    ciudad,
    centro_id,
    centro_name,
    centro_siglas,
    curso_id,
    curso_name,
    area_tecnica,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(sexo,'')) LIKE 'M%')::int  AS hombres,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(sexo,'')) LIKE 'F%')::int  AS mujeres,
    COUNT(*) FILTER (WHERE LOWER(COALESCE(tipo_formacion,'normal')) = 'normal')::int AS formacion_normal,
    COUNT(*) FILTER (WHERE LOWER(COALESCE(tipo_formacion,'')) = 'dual')::int         AS formacion_dual,
    COUNT(*)::int                                                                      AS total
  FROM matricula
  GROUP BY project_name, ciudad, centro_id, centro_name, centro_siglas, curso_id, curso_name, area_tecnica
  ORDER BY ciudad, centro_name, curso_name
`;

export const handler = reportHandler(async (req) => {
  const rawProject = req.query.project;
  const projectUuids = !rawProject
    ? null
    : (Array.isArray(rawProject) ? rawProject : String(rawProject).split(','))
        .map((s) => String(s).trim()).filter(Boolean);

  const rawCftp = req.query.cftp;
  const centroIds = !rawCftp
    ? null
    : (Array.isArray(rawCftp) ? rawCftp : String(rawCftp).split(','))
        .map((s) => parseInt(String(s).trim(), 10))
        .filter(Number.isFinite);

  const [rows] = await sequelize.query(SQL, { bind: [projectUuids, centroIds] });

  const out = rows.map((r) => ({
    proyecto: r.project_name ?? '—',
    ciudad: r.ciudad ?? '—',
    centroId: r.centro_id,
    centro: r.centro_siglas ? `${r.centro_siglas} — ${r.centro_name}` : r.centro_name,
    curso: r.curso_name,
    areaTecnica: r.area_tecnica ?? '—',
    hombres: r.hombres,
    mujeres: r.mujeres,
    formacionNormal: r.formacion_normal,
    formacionDual: r.formacion_dual,
    total: r.total,
  }));

  return { rows: out, total: out.length };
});
