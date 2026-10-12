import { sequelize } from '../../../utils/sequelize.js';
import {
  reportHandler, parsePagination, parseUuidList, parseIntList, parseIntValue, parseIsoDate, parseEnumList, GENERO_SQL,
} from '../shared.js';
import { ESTATUS_SEGUIMIENTO } from '../../../utils/egresados-catalogos.js';

// R2 · Listado detallado de estudiantes (paginado en el servidor).
//
// Una fila por matrícula (estudiante × proceso): la base del Anexo I del
// cliente. Muestra lo que captura el formulario del estudiante (el UI dicta
// qué campos están vigentes), el resultado del curso y el último estatus de
// seguimiento. Los datos laborales del formulario son de la INSCRIPCIÓN.
//
// Filtros: from/to (fecha de inicio del curso), project, financingSource,
// cftp, course, technicalArea, gender, age_min/age_max (edad actual),
// resultado (SIN_CIERRE, EN_CURSO, EGRESADO, DESERTOR).

const BASE_JOINS = `
  FROM centros.estudiantes e
  JOIN centros.proceso_matriculas pm  ON pm.estudiante_id = e.id AND pm.estatus = 1
  JOIN centros.procesos proc          ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
  JOIN centros.centros c              ON c.id = proc.centro_id
  JOIN centros.cursos cu              ON cu.id = proc.curso_id
`;

// Catálogos y último seguimiento: solo para el listado (el conteo no los usa).
const DETAIL_JOINS = `
  LEFT JOIN centros.departamentos d       ON d.id = e.departamento_id
  LEFT JOIN centros.municipios mun        ON mun.id = e.municipio_id
  LEFT JOIN centros.nivel_escolaridads ne ON ne.id = e.nivel_escolaridad_id
  LEFT JOIN centros.discapacidads di      ON di.id = e.discapacidad_id
  LEFT JOIN LATERAL (
    SELECT s.estatus, s.fecha_corte FROM centros.seguimientos s
     WHERE s.proceso_matricula_id = pm.id ORDER BY s.fecha_corte DESC LIMIT 1
  ) us ON true
`;

const WHERE = `
  WHERE ($1::date   IS NULL OR proc.fecha_inicial >= $1)
    AND ($2::date   IS NULL OR proc.fecha_inicial <= $2)
    AND ($3::uuid[] IS NULL OR EXISTS (
          SELECT 1 FROM caderh.projects_processes pp
           WHERE pp.process_id = proc.id AND pp.project_id = ANY($3::uuid[])))
    AND ($4::uuid[] IS NULL OR EXISTS (
          SELECT 1 FROM caderh.projects_processes pp
            JOIN caderh.project_financing_sources pfs ON pfs.project_id = pp.project_id
           WHERE pp.process_id = proc.id AND pfs.financing_source_id = ANY($4::uuid[])))
    AND ($5::int[]  IS NULL OR proc.centro_id = ANY($5::int[]))
    AND ($6::int[]  IS NULL OR proc.curso_id = ANY($6::int[]))
    AND ($7::int[]  IS NULL OR EXISTS (
          SELECT 1 FROM centros.curso_areas ca
           WHERE ca.curso_id = proc.curso_id AND ca.area_id = ANY($7::int[])))
    AND ($8::text[] IS NULL OR ${GENERO_SQL('e.sexo')} = ANY($8::text[]))
    AND ($9::int    IS NULL OR DATE_PART('year', AGE(CURRENT_DATE, e.fecha_nacimiento))::int >= $9)
    AND ($10::int   IS NULL OR DATE_PART('year', AGE(CURRENT_DATE, e.fecha_nacimiento))::int <= $10)
    AND ($11::text[] IS NULL OR (
          CASE
            WHEN pm.resultado IS NOT NULL THEN pm.resultado
            WHEN proc.fecha_final < CURRENT_DATE THEN 'SIN_CIERRE'
            ELSE 'EN_CURSO'
          END) = ANY($11::text[]))
`;

const SQL = `
  SELECT
    ROW_NUMBER() OVER (ORDER BY e.apellidos, e.nombres, proc.fecha_inicial)::int AS num,
    c.nombre                                       AS centro,
    cu.nombre                                      AS curso,
    proc.codigo                                    AS codigo_proceso,
    proc.fecha_inicial::text                       AS inicio,
    (SELECT a.nombre FROM centros.curso_areas ca JOIN centros.areas a ON a.id = ca.area_id
      WHERE ca.curso_id = proc.curso_id ORDER BY ca.id LIMIT 1) AS area_tecnica,
    (SELECT STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name)
       FROM caderh.projects_processes pp JOIN caderh.projects p ON p.id = pp.project_id
      WHERE pp.process_id = proc.id AND p.project_status <> 'DELETED') AS proyectos,
    CONCAT(e.nombres, ' ', e.apellidos)            AS nombre_completo,
    e.identidad                                    AS dni,
    e.fecha_nacimiento::text                       AS fecha_nacimiento,
    DATE_PART('year', AGE(CURRENT_DATE, e.fecha_nacimiento))::int AS edad,
    CASE ${GENERO_SQL('e.sexo')} WHEN 'M' THEN 'Masculino' WHEN 'F' THEN 'Femenino' ELSE e.sexo END AS sexo,
    e.estado_civil                                 AS estado_civil,
    e.celular                                      AS celular,
    NULLIF(CONCAT_WS(' · ', NULLIF(TRIM(e.telefono_r), ''), NULLIF(TRIM(e.nombre_r), '')), '') AS telefono_alternativo,
    e.email                                        AS correo,
    NULLIF(CONCAT_WS(' / ', NULLIF(TRIM(e.facebook), ''), NULLIF(TRIM(e.instagram), '')), '') AS redes,
    d.nombre                                       AS departamento,
    mun.nombre                                     AS municipio,
    e.direccion                                    AS direccion,
    e.vive                                         AS con_quien_vive,
    NULLIF(TRIM(e.numero_dep), '')                 AS dependientes,
    CASE WHEN e.tiene_hijos = 1 THEN 'Sí' ELSE 'No' END AS tiene_hijos,
    CASE
      WHEN di.nombre IS NULL OR LOWER(di.nombre) = 'ninguna' THEN NULLIF(TRIM(e.discapacidad_detalle), '')
      ELSE CONCAT_WS(': ', di.nombre, NULLIF(TRIM(e.discapacidad_detalle), ''))
    END                                            AS discapacidad,
    CASE WHEN e.interno = 1 THEN 'Sí' ELSE 'No' END AS interno,
    ne.nombre                                      AS nivel_educativo,
    CASE WHEN e.estudia = 1 THEN 'Sí' ELSE 'No' END AS estudia,
    CASE WHEN e.trabajo_actual = 1 THEN 'Sí' ELSE 'No' END AS trabaja,
    e.donde_trabaja                                AS empresa,
    e.puesto                                       AS puesto,
    e.tipo_contrato_ant                            AS tipo_contrato,
    NULLIF(CONCAT_WS(' · ', NULLIF(TRIM(e.beneficios_empleo), ''), NULLIF(TRIM(e.beneficios_empleo_otro), '')), '') AS beneficios,
    CASE WHEN e.autoempleo = 1 THEN COALESCE(NULLIF(TRIM(e.autoempleo_dedicacion), ''), 'Sí') END AS emprendimiento,
    CASE WHEN e.autoempleo = 1 THEN NULLIF(TRIM(e.autoempleo_tiempo), '') END AS antiguedad_emprendimiento,
    NULLIF(e.ingreso_promedio, 0)                  AS ingreso_hogar,
    e.observaciones                                AS observaciones,
    CASE
      WHEN pm.resultado = 'EGRESADO' THEN 'Egresó'
      WHEN pm.resultado = 'DESERTOR' THEN 'Desertó'
      WHEN proc.fecha_final < CURRENT_DATE THEN 'Sin cierre'
      ELSE 'En curso'
    END                                            AS resultado,
    us.estatus                                     AS estatus_seguimiento,
    us.fecha_corte::text                           AS fecha_seguimiento
  ${BASE_JOINS}
  ${DETAIL_JOINS}
  ${WHERE}
  ORDER BY e.apellidos, e.nombres, proc.fecha_inicial
  LIMIT $12 OFFSET $13
`;

const COUNT_SQL = `SELECT COUNT(*)::int AS total ${BASE_JOINS} ${WHERE}`;

const RESULTADOS = ['SIN_CIERRE', 'EN_CURSO', 'EGRESADO', 'DESERTOR'];

// "¿Con quién vive?" del SGC heredado: arreglo JSON de ids posicionales (1..5);
// los registros nuevos guardan la etiqueta. Fuente: GET /centros/vive-catalogo.
const VIVE_LABELS = { 1: 'Padres', 2: 'Solo(a)', 3: 'Pareja', 4: 'Familiares', 5: 'Otros' };
function formatConQuienVive(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\\/g, '');
  if (!s || s.toLowerCase() === 'null') return null;
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const labels = arr.map((v) => VIVE_LABELS[parseInt(String(v), 10)] ?? String(v).trim()).filter(Boolean);
        return labels.length ? labels.join(', ') : null;
      }
    } catch {
      // JSON malformado: se muestra el texto tal cual
    }
  }
  return s;
}

export const handler = reportHandler(async (req) => {
  const q = req.query;
  const filterBinds = [
    parseIsoDate(q.from),                       // $1
    parseIsoDate(q.to),                         // $2
    parseUuidList(q.project),                   // $3
    parseUuidList(q.financingSource),           // $4
    parseIntList(q.cftp),                       // $5
    parseIntList(q.course),                     // $6
    parseIntList(q.technicalArea),              // $7
    parseEnumList(q.gender, ['M', 'F']),        // $8
    parseIntValue(q.age_min),                   // $9
    parseIntValue(q.age_max),                   // $10
    parseEnumList(q.resultado, RESULTADOS),     // $11
  ];
  const { pageSize, offset } = parsePagination(q);

  const [rows] = await sequelize.query(SQL, { bind: [...filterBinds, pageSize, offset] });
  const [[{ total }]] = await sequelize.query(COUNT_SQL, { bind: filterBinds });

  return {
    rows: rows.map((r) => ({
      ...r,
      con_quien_vive: formatConQuienVive(r.con_quien_vive),
      ingreso_hogar: r.ingreso_hogar != null ? Number(r.ingreso_hogar) : null,
      estatus_seguimiento: r.estatus_seguimiento ? ESTATUS_SEGUIMIENTO[r.estatus_seguimiento] : null,
    })),
    total,
    kpis: { totalRegistros: total },
    meta: { missingColumns: ['migranteRetornado'] },
  };
});
