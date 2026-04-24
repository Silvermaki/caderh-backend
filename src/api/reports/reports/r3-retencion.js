import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler } from '../shared.js';

// R3: % retención por proyecto/centro/curso.
// Matrícula inicial = estudiantes con proceso_matricula.estatus = 1.
// Matrícula final = egresados de ese mismo (centro, curso). egresados no tiene
// proceso_id FK directo, así que se aproxima vía proceso_matriculas.

const SQL = `
  WITH inicial AS (
    SELECT
      pro.id                              AS project_id,
      pro.name                            AS project_name,
      c.id                                AS centro_id,
      c.nombre                            AS centro_name,
      cu.id                               AS curso_id,
      cu.nombre                           AS curso_name,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(e.sexo,'')) LIKE 'M%')::int AS h_inicial,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(e.sexo,'')) LIKE 'F%')::int AS m_inicial,
      COUNT(*)::int                                                     AS total_inicial
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc   ON proc.id = pm.proceso_id
    JOIN centros.centros c       ON c.id = proc.centro_id
    JOIN centros.cursos cu       ON cu.id = proc.curso_id
    JOIN centros.estudiantes e   ON e.id = pm.estudiante_id
    LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
    LEFT JOIN caderh.projects pro ON pro.id = pp.project_id
    WHERE pm.estatus = 1
      AND ($1::uuid[] IS NULL OR pro.id = ANY($1::uuid[]))
    GROUP BY pro.id, pro.name, c.id, c.nombre, cu.id, cu.nombre
  ),
  finales AS (
    SELECT
      proc.centro_id                      AS centro_id,
      proc.curso_id                       AS curso_id,
      COUNT(DISTINCT eg.estudiante_id) FILTER (WHERE UPPER(COALESCE(e.sexo,'')) LIKE 'M%')::int AS h_final,
      COUNT(DISTINCT eg.estudiante_id) FILTER (WHERE UPPER(COALESCE(e.sexo,'')) LIKE 'F%')::int AS m_final,
      COUNT(DISTINCT eg.estudiante_id)::int                                                     AS total_final
    FROM centros.egresados eg
    JOIN centros.estudiantes e    ON e.id = eg.estudiante_id
    JOIN centros.proceso_matriculas pm ON pm.estudiante_id = e.id
    JOIN centros.procesos proc    ON proc.id = pm.proceso_id
    WHERE pm.estatus = 1
    GROUP BY proc.centro_id, proc.curso_id
  )
  SELECT
    i.project_name,
    i.centro_name,
    i.curso_name,
    i.h_inicial, i.m_inicial, i.total_inicial,
    COALESCE(f.h_final, 0)     AS h_final,
    COALESCE(f.m_final, 0)     AS m_final,
    COALESCE(f.total_final, 0) AS total_final,
    (i.total_inicial - COALESCE(f.total_final, 0))::int AS desercion,
    CASE WHEN i.total_inicial > 0
      THEN (COALESCE(f.total_final, 0)::float / i.total_inicial::float) * 100
      ELSE 0 END                                           AS pct_retencion
  FROM inicial i
  LEFT JOIN finales f ON f.centro_id = i.centro_id AND f.curso_id = i.curso_id
  ORDER BY i.project_name, i.centro_name, i.curso_name
`;

export const handler = reportHandler(async (req) => {
  const rawProject = req.query.project;
  const projectUuids = !rawProject ? null
    : (Array.isArray(rawProject) ? rawProject : String(rawProject).split(','))
        .map((s) => String(s).trim()).filter(Boolean);

  const [rows] = await sequelize.query(SQL, { bind: [projectUuids] });

  const out = rows.map((r) => ({
    proyecto: r.project_name ?? '—',
    centro: r.centro_name,
    curso: r.curso_name,
    hombresInicial: r.h_inicial,
    mujeresInicial: r.m_inicial,
    totalInicial: r.total_inicial,
    hombresFinal: r.h_final,
    mujeresFinal: r.m_final,
    totalFinal: r.total_final,
    desercion: r.desercion,
    pctRetencion: Number(r.pct_retencion),
  }));

  return { rows: out, total: out.length };
});
