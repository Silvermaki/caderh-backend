import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler } from '../shared.js';

// R3: % de Retención por (proyecto, ciudad, centro, curso, año, trimestre, edad).
//
// Filtros: idem R1 (project, cftp, financingSource, technicalArea, city,
// year, quarter calendario, age range, gender).
//
// Reglas (esquema post-recaptura):
//   1. Atribución EXACTA del egreso: egresados.proceso_matricula_id (FK UNIQUE
//      a la matrícula) → proceso_matriculas → proceso_id. Ya no se usa la
//      heurística "proceso más reciente por estudiante"; la atribución deja
//      de ser aproximada.
//   2. inicial NO se filtra por pm.estatus=1; queremos todos los matriculados
//      históricamente para que el ratio final/inicial refleje retención real.
//   3. Género: CASE explícito sobre el canónico 'M'/'F' (tolera variantes
//      heredadas Masculino/Hombre/Femenino/Mujer) en vez de LIKE 'M%'.
//   4. Deserción reportada via egresados.deserto IS NOT NULL (registro directo)
//      en vez de inicial − final que puede ser negativo si hay anomalías.
//   5. fecha_nacimiento ya es DATE real (con CHECK de rango en captura):
//      la edad se calcula con AGE directo, sin guard de regex.

const SQL = `
  WITH base AS (
    SELECT
      pm.estudiante_id,
      pm.proceso_id,
      proc.centro_id,
      proc.curso_id,
      pro.id                              AS project_id,
      pro.name                            AS project_name,
      mun.nombre                          AS ciudad,
      c.nombre                            AS centro_name,
      c.siglas                            AS centro_siglas,
      cu.nombre                           AS curso_name,
      (SELECT STRING_AGG(DISTINCT a.nombre, ', ' ORDER BY a.nombre)
         FROM centros.curso_areas ca
         JOIN centros.areas a ON a.id = ca.area_id
         WHERE ca.curso_id = cu.id)       AS area_tecnica,
      EXTRACT(YEAR    FROM proc.fecha_inicial)::int  AS anio,
      EXTRACT(QUARTER FROM proc.fecha_inicial)::int  AS trimestre,
      DATE_PART('year', AGE(proc.fecha_inicial, e.fecha_nacimiento))::int AS edad,
      CASE
        WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('M','MASCULINO','HOMBRE') THEN 'M'
        WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('F','FEMENINO','MUJER')   THEN 'F'
        ELSE NULL
      END                                 AS genero
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc            ON proc.id = pm.proceso_id
    JOIN centros.centros c                ON c.id = proc.centro_id
    LEFT JOIN centros.municipios mun      ON mun.id = c.municipio_id
    JOIN centros.cursos cu                ON cu.id = proc.curso_id
    JOIN centros.estudiantes e            ON e.id = pm.estudiante_id
    LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
    LEFT JOIN caderh.projects pro         ON pro.id = pp.project_id
    WHERE 1=1
      AND ($1::uuid[] IS NULL OR pro.id = ANY($1::uuid[]))
      AND ($2::int[]  IS NULL OR c.id  = ANY($2::int[]))
      AND ($3::uuid[] IS NULL OR EXISTS (
            SELECT 1 FROM caderh.project_financing_sources pfs
            WHERE pfs.project_id = pro.id
              AND pfs.financing_source_id = ANY($3::uuid[])
          ))
      AND ($4::int[]  IS NULL OR EXISTS (
            SELECT 1 FROM centros.curso_areas ca2
            WHERE ca2.curso_id = cu.id
              AND ca2.area_id = ANY($4::int[])
          ))
      AND ($5::int[]  IS NULL OR c.municipio_id = ANY($5::int[]))
      AND ($6::int    IS NULL OR EXTRACT(YEAR    FROM proc.fecha_inicial) = $6)
      AND ($7::int    IS NULL OR EXTRACT(QUARTER FROM proc.fecha_inicial) = $7)
      AND ($10::text[] IS NULL OR (
            CASE
              WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('M','MASCULINO','HOMBRE') THEN 'M'
              WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('F','FEMENINO','MUJER')   THEN 'F'
              ELSE NULL
            END = ANY($10::text[])
          ))
  ),
  base_filtered AS (
    SELECT *
    FROM base
    WHERE ($8::int IS NULL OR edad >= $8)
      AND ($9::int IS NULL OR edad <= $9)
  ),
  -- Egreso atado a su matrícula exacta: proceso_matricula_id es FK UNIQUE a
  -- proceso_matriculas, de donde salen estudiante y proceso sin ambigüedad.
  egreso_proceso AS (
    SELECT
      pm.estudiante_id,
      pm.proceso_id,
      eg.final     AS final_date,
      eg.deserto   AS deserto_date,
      eg.tipo_egreso
    FROM centros.egresados eg
    JOIN centros.proceso_matriculas pm ON pm.id = eg.proceso_matricula_id
  )
  SELECT
    b.project_name,
    b.ciudad,
    b.centro_name,
    b.centro_siglas,
    b.curso_name,
    b.area_tecnica,
    b.anio,
    b.trimestre,
    b.edad,
    COUNT(*) FILTER (WHERE b.genero = 'M')::int                                                            AS h_inicial,
    COUNT(*) FILTER (WHERE b.genero = 'F')::int                                                            AS m_inicial,
    COUNT(*)::int                                                                                          AS total_inicial,
    COUNT(*) FILTER (WHERE b.genero = 'M' AND ep.final_date IS NOT NULL)::int                              AS h_final,
    COUNT(*) FILTER (WHERE b.genero = 'F' AND ep.final_date IS NOT NULL)::int                              AS m_final,
    COUNT(*) FILTER (WHERE ep.final_date IS NOT NULL)::int                                                 AS total_final,
    COUNT(*) FILTER (WHERE ep.deserto_date IS NOT NULL)::int                                               AS total_desertados,
    CASE
      WHEN COUNT(*) > 0 THEN ROUND(
        (COUNT(*) FILTER (WHERE ep.final_date IS NOT NULL))::numeric / COUNT(*)::numeric * 100, 2
      )
      ELSE 0
    END                                                                                                    AS pct_retencion
  FROM base_filtered b
  LEFT JOIN egreso_proceso ep
    ON ep.estudiante_id = b.estudiante_id AND ep.proceso_id = b.proceso_id
  GROUP BY b.project_name, b.ciudad, b.centro_name, b.centro_siglas,
           b.curso_name, b.area_tecnica, b.anio, b.trimestre, b.edad
  ORDER BY b.ciudad NULLS LAST, b.centro_name, b.curso_name, b.anio NULLS LAST, b.trimestre NULLS LAST, b.edad NULLS LAST
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

function parseQuarter(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^Q?([1-4])$/);
  return m ? parseInt(m[1], 10) : null;
}

function parseGender(raw) {
  if (!raw) return null;
  const arr = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => s === 'M' || s === 'F');
  return arr.length ? arr : null;
}

export const handler = reportHandler(async (req) => {
  const projectUuids     = parseUuids(req.query.project);
  const centroIds        = parseInts(req.query.cftp);
  const financingUuids   = parseUuids(req.query.financingSource);
  const technicalAreaIds = parseInts(req.query.technicalArea);
  const cityIds          = parseInts(req.query.city);
  const year             = parseInt1(req.query.year);
  const quarter          = parseQuarter(req.query.quarter);
  const ageMin           = parseInt1(req.query.age_min);
  const ageMax           = parseInt1(req.query.age_max);
  const genders          = parseGender(req.query.gender);

  const [rows] = await sequelize.query(SQL, {
    bind: [
      projectUuids,     // $1
      centroIds,        // $2
      financingUuids,   // $3
      technicalAreaIds, // $4
      cityIds,          // $5
      year,             // $6
      quarter,          // $7
      ageMin,           // $8
      ageMax,           // $9
      genders,          // $10
    ],
  });

  const out = rows.map((r) => ({
    proyecto: r.project_name ?? '—',
    ciudad: r.ciudad ?? '—',
    centro: r.centro_siglas ? `${r.centro_siglas} — ${r.centro_name}` : r.centro_name,
    curso: r.curso_name,
    areaTecnica: r.area_tecnica ?? '—',
    anio: r.anio,
    trimestre: r.trimestre,
    edad: r.edad,
    hombresInicial: r.h_inicial,
    mujeresInicial: r.m_inicial,
    totalInicial: r.total_inicial,
    hombresFinal: r.h_final,
    mujeresFinal: r.m_final,
    totalFinal: r.total_final,
    desercion: r.total_desertados,
    pctRetencion: Number(r.pct_retencion),
  }));

  const totalInicial = out.reduce((s, r) => s + (r.totalInicial ?? 0), 0);
  const totalFinal   = out.reduce((s, r) => s + (r.totalFinal   ?? 0), 0);
  const totalDesertados = out.reduce((s, r) => s + (r.desercion ?? 0), 0);
  const totalHInicial = out.reduce((s, r) => s + (r.hombresInicial ?? 0), 0);
  const totalMInicial = out.reduce((s, r) => s + (r.mujeresInicial ?? 0), 0);
  const totalHFinal   = out.reduce((s, r) => s + (r.hombresFinal ?? 0), 0);
  const totalMFinal   = out.reduce((s, r) => s + (r.mujeresFinal ?? 0), 0);
  const pctRetencionGlobal = totalInicial > 0
    ? Math.round((totalFinal / totalInicial) * 10000) / 100
    : 0;

  return {
    rows: out,
    total: out.length,
    totals: {
      hombresInicial: totalHInicial,
      mujeresInicial: totalMInicial,
      totalInicial,
      hombresFinal: totalHFinal,
      mujeresFinal: totalMFinal,
      totalFinal,
      desercion: totalDesertados,
      pctRetencion: pctRetencionGlobal,
    },
    kpis: {
      totalInicial,
      totalFinal,
      totalDesertados,
      pctRetencionGlobal,
    },
  };
});
