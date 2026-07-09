import { sequelize } from '../../../utils/sequelize.js';
import { reportHandler, parsePagination } from '../shared.js';

// R2: Listado detallado de jóvenes (paged).
// Mismos filtros que R1: project, cftp, financingSource, technicalArea, city,
// year, quarter (calendario), age range, gender.
//
// Cada fila = (estudiante, proceso). Si un joven está en múltiples procesos
// aparece múltiples veces — cada matrícula tiene su contexto (proyecto, fuente,
// año, trimestre, edad-en-ese-momento) distinto.
//
// Schema notes:
//   - centros.estudiantes.fecha_nacimiento es TEXT — guard con regex antes de cast.
//     El guard exige años 19xx/20xx: la data SGC trae fechas con año 0000 (el cast a date revienta) y años 0021-0200 (edades absurdas).
//   - centros.estudiantes.sexo es TEXT libre — normalización con CASE explícito.
//   - centro mostrado = el centro del proceso (no el centro origen del estudiante),
//     porque el reporte es sobre participación formativa.

const BASE_WHERE = `
  WHERE pm.estatus = 1
    AND ($1::uuid[] IS NULL OR pp.project_id = ANY($1::uuid[]))
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
    AND ($8::int IS NULL OR (
          CASE
            WHEN e.fecha_nacimiento ~ '^(19|20)\\d{2}-\\d{2}-\\d{2}'
              THEN DATE_PART('year', AGE(CURRENT_DATE, e.fecha_nacimiento::date))::int
            ELSE NULL
          END >= $8
        ))
    AND ($9::int IS NULL OR (
          CASE
            WHEN e.fecha_nacimiento ~ '^(19|20)\\d{2}-\\d{2}-\\d{2}'
              THEN DATE_PART('year', AGE(CURRENT_DATE, e.fecha_nacimiento::date))::int
            ELSE NULL
          END <= $9
        ))
`;

const SQL = `
  SELECT
    ROW_NUMBER() OVER (ORDER BY e.apellidos, e.nombres, proc.fecha_inicial)::int AS num,
    c.nombre                                       AS centro,
    mun.nombre                                     AS ciudad,
    cu.nombre                                      AS curso,
    (SELECT STRING_AGG(DISTINCT a.nombre, ', ' ORDER BY a.nombre)
       FROM centros.curso_areas ca
       JOIN centros.areas a ON a.id = ca.area_id
       WHERE ca.curso_id = proc.curso_id)          AS area_tecnica,
    -- Fuente(s) de financiamiento de los proyectos vinculados al proceso de la
    -- matrícula. Subconsulta correlacionada para no multiplicar filas cuando
    -- un proceso tiene varios proyectos/fuentes.
    (SELECT STRING_AGG(DISTINCT fs.name, ', ' ORDER BY fs.name)
       FROM caderh.projects_processes pp2
       JOIN caderh.project_financing_sources pfs2 ON pfs2.project_id = pp2.project_id
       JOIN caderh.financing_sources fs           ON fs.id = pfs2.financing_source_id
       WHERE pp2.process_id = proc.id)             AS fuentes_financiamiento,
    EXTRACT(YEAR    FROM proc.fecha_inicial)::int  AS anio,
    EXTRACT(QUARTER FROM proc.fecha_inicial)::int  AS trimestre,
    CONCAT(e.nombres, ' ', e.apellidos)            AS nombre_completo,
    e.identidad                                    AS dni,
    e.fecha_nacimiento                             AS fecha_nacimiento,
    CASE
      WHEN e.fecha_nacimiento ~ '^(19|20)\\d{2}-\\d{2}-\\d{2}'
        THEN DATE_PART('year', AGE(CURRENT_DATE, e.fecha_nacimiento::date))::int
      ELSE NULL
    END                                            AS edad,
    e.sexo                                         AS sexo,
    e.estado_civil                                 AS estado_civil,
    e.celular                                      AS telefono_celular,
    e.email                                        AS correo,
    d.nombre                                       AS departamento,
    e.direccion                                    AS direccion,
    e.vive                                         AS con_quien_vive,
    e.tiene_hijos                                  AS tiene_hijos,
    e.discapacidad_id                              AS discapacidad,
    e.trabajo_actual                               AS trabajo_actual,
    e.donde_trabaja                                AS donde_trabaja,
    e.estudia                                      AS estudia,
    e.autoempleo                                   AS autoempleo
  FROM centros.estudiantes e
  JOIN centros.proceso_matriculas pm  ON pm.estudiante_id = e.id
  JOIN centros.procesos proc          ON proc.id = pm.proceso_id
  JOIN centros.centros c              ON c.id = proc.centro_id
  LEFT JOIN centros.municipios mun    ON mun.id = c.municipio_id
  LEFT JOIN centros.departamentos d   ON d.id = e.departamento_id
  JOIN centros.cursos cu              ON cu.id = proc.curso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  ${BASE_WHERE}
  ORDER BY e.apellidos, e.nombres, proc.fecha_inicial
  LIMIT $11 OFFSET $12
`;

const COUNT_SQL = `
  SELECT COUNT(*)::int AS total
  FROM centros.estudiantes e
  JOIN centros.proceso_matriculas pm  ON pm.estudiante_id = e.id
  JOIN centros.procesos proc          ON proc.id = pm.proceso_id
  JOIN centros.centros c              ON c.id = proc.centro_id
  JOIN centros.cursos cu              ON cu.id = proc.curso_id
  LEFT JOIN caderh.projects_processes pp ON pp.process_id = proc.id
  ${BASE_WHERE}
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

// Catálogo "¿Con quién vive?" — fuente: src/api/centros/centros.api.js
// (GET /centros/vive-catalogo). El SGC heredado guardó el campo como arreglo
// JSON de ids posicionales (1..5) sobre este mismo catálogo; los registros
// nuevos guardan el label directamente.
const VIVE_LABELS = {
  1: 'Padres',
  2: 'Solo(a)',
  3: 'Pareja',
  4: 'Familiares',
  5: 'Otros',
};

// '["1"]' → 'Padres' · '["1","3"]' → 'Padres, Pareja' · 'Padres' → 'Padres'.
// Defensivo con null/vacío/JSON malformado: devuelve null o el texto crudo.
function formatConQuienVive(raw) {
  if (raw == null) return null;
  // El SGC guardó el JSON con comillas escapadas literales (ej. [\"1\"]);
  // se limpian los backslashes antes de parsear.
  const s = String(raw).trim().replace(/\\/g, '');
  if (!s || s.toLowerCase() === 'null') return null;
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const labels = arr
          .map((v) => VIVE_LABELS[parseInt(String(v), 10)] ?? String(v).trim())
          .filter(Boolean);
        return labels.length ? labels.join(', ') : null;
      }
    } catch {
      // JSON malformado — se muestra el texto tal cual
    }
  }
  return s;
}

// discapacidad_id es TEXT libre; vacío o el literal 'null' se normaliza a null
// para que el frontend pinte '—' en vez del string 'null'.
function cleanText(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null') return null;
  return s;
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

  const { pageSize, offset } = parsePagination(req.query);

  const filterBinds = [
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
  ];

  const [rows] = await sequelize.query(SQL, {
    bind: [...filterBinds, pageSize, offset],
  });
  const [countRows] = await sequelize.query(COUNT_SQL, { bind: filterBinds });

  const total = countRows[0]?.total ?? 0;

  const out = rows.map((r) => ({
    ...r,
    con_quien_vive: formatConQuienVive(r.con_quien_vive),
    discapacidad: cleanText(r.discapacidad),
  }));

  return {
    rows: out,
    total,
    kpis: {
      totalRegistros: total,
    },
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
