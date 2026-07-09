import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler } from '../shared.js';

// R1: Matrícula por CFTP.
// Pivot por (proyecto, ciudad, centro, curso, area_tecnica, año, trimestre, edad).
// Filtros: project, cftp (centro), financingSource (via project), technicalArea,
// city (municipio), year, quarter (calendario), age range (min-max), gender.
//
// Schema notes:
//   - centros.cursos NO tiene area_id; áreas vienen de centros.curso_areas (junction).
//     Para evitar doble-conteo cuando un curso tiene varias áreas, agregamos las
//     áreas como string con STRING_AGG en subquery.
//   - centros.estudiantes.fecha_nacimiento es TEXT, no DATE; casteamos con guard.
//     El guard exige años 19xx/20xx: la data SGC trae fechas con año 0000 (el cast a date revienta) y años 0021-0200 (edades absurdas).
//   - centros.estudiantes.sexo es TEXT libre — normalizamos con CASE explícito
//     (Masculino/M/Hombre vs Femenino/F/Mujer) en vez de LIKE 'M%' que rompe con "Mujer".
//   - año/trimestre se derivan de proc.fecha_inicial (DATE), no de created_at.

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
      (SELECT STRING_AGG(DISTINCT a.nombre, ', ' ORDER BY a.nombre)
         FROM centros.curso_areas ca
         JOIN centros.areas a ON a.id = ca.area_id
         WHERE ca.curso_id = cu.id)       AS area_tecnica,
      EXTRACT(YEAR    FROM proc.fecha_inicial)::int  AS anio,
      EXTRACT(QUARTER FROM proc.fecha_inicial)::int  AS trimestre,
      CASE
        WHEN e.fecha_nacimiento ~ '^(19|20)\\d{2}-\\d{2}-\\d{2}'
          THEN DATE_PART('year', AGE(proc.fecha_inicial, e.fecha_nacimiento::date))::int
        ELSE NULL
      END                                 AS edad,
      CASE
        WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('M', 'MASCULINO', 'HOMBRE') THEN 'M'
        WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('F', 'FEMENINO', 'MUJER')   THEN 'F'
        ELSE NULL
      END                                 AS genero,
      COALESCE(tm.nombre, 'Normal')       AS tipo_formacion
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc            ON proc.id = pm.proceso_id
    JOIN centros.centros c                ON c.id = proc.centro_id
    LEFT JOIN centros.municipios mun      ON mun.id = c.municipio_id
    JOIN centros.cursos cu                ON cu.id = proc.curso_id
    JOIN centros.estudiantes e            ON e.id = pm.estudiante_id
    LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
    LEFT JOIN caderh.projects pro         ON pro.id = pp.project_id
    LEFT JOIN centros.metodologias tm     ON tm.id = proc.metodologia_id
    WHERE pm.estatus = 1
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
  matricula_filtered AS (
    SELECT *
    FROM matricula
    WHERE ($8::int IS NULL OR edad >= $8)
      AND ($9::int IS NULL OR edad <= $9)
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
    anio,
    trimestre,
    edad,
    -- Fuente(s) de financiamiento del proyecto de la fila. Subconsulta
    -- correlacionada sobre el project_id agrupado — nunca un JOIN en el FROM
    -- del agregado, para no multiplicar los conteos del pivot.
    (SELECT STRING_AGG(DISTINCT fs.name, ', ' ORDER BY fs.name)
       FROM caderh.project_financing_sources pfs
       JOIN caderh.financing_sources fs ON fs.id = pfs.financing_source_id
       WHERE pfs.project_id = matricula_filtered.project_id)                           AS fuentes,
    COUNT(*) FILTER (WHERE genero = 'M')::int                                          AS hombres,
    COUNT(*) FILTER (WHERE genero = 'F')::int                                          AS mujeres,
    COUNT(*) FILTER (WHERE LOWER(COALESCE(tipo_formacion,'normal')) = 'normal')::int   AS formacion_normal,
    COUNT(*) FILTER (WHERE LOWER(COALESCE(tipo_formacion,'')) = 'dual')::int           AS formacion_dual,
    COUNT(*)::int                                                                      AS total
  FROM matricula_filtered
  GROUP BY project_id, project_name, ciudad, centro_id, centro_name, centro_siglas,
           curso_id, curso_name, area_tecnica, anio, trimestre, edad
  ORDER BY ciudad NULLS LAST, centro_name, curso_name, anio NULLS LAST, trimestre NULLS LAST, edad NULLS LAST
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
    fuentes: r.fuentes ?? '—',
    ciudad: r.ciudad ?? '—',
    centroId: r.centro_id,
    centro: r.centro_siglas ? `${r.centro_siglas} — ${r.centro_name}` : r.centro_name,
    curso: r.curso_name,
    areaTecnica: r.area_tecnica ?? '—',
    anio: r.anio,
    trimestre: r.trimestre,
    edad: r.edad,
    hombres: r.hombres,
    mujeres: r.mujeres,
    formacionNormal: r.formacion_normal,
    formacionDual: r.formacion_dual,
    total: r.total,
  }));

  const totalHombres   = out.reduce((s, r) => s + (r.hombres   ?? 0), 0);
  const totalMujeres   = out.reduce((s, r) => s + (r.mujeres   ?? 0), 0);
  const totalGeneral   = totalHombres + totalMujeres;
  const totalNormal    = out.reduce((s, r) => s + (r.formacionNormal ?? 0), 0);
  const totalDual      = out.reduce((s, r) => s + (r.formacionDual   ?? 0), 0);

  return {
    rows: out,
    total: out.length,
    totals: {
      hombres: totalHombres,
      mujeres: totalMujeres,
      formacionNormal: totalNormal,
      formacionDual: totalDual,
      total: totalGeneral,
    },
    kpis: {
      totalHombres,
      totalMujeres,
      totalGeneral,
    },
  };
});
