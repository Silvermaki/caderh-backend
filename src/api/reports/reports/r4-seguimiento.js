import { sequelize } from '../../../utils/sequelize.js';
import {
  reportHandler, parseUuidList, parseIntList, parseIsoDate, parseEnumList,
} from '../shared.js';
import {
  ESTATUS_SEGUIMIENTO, GRUPO_ESTATUS, RESULTADOS_PASANTIA,
} from '../../../utils/egresados-catalogos.js';

// R4 · Seguimiento post-formación.
//
// Una fila por EGRESADO (matrícula con resultado EGRESADO) con su estatus AL
// CORTE: el último registro de seguimiento con fecha_corte <= corte (por
// defecto hoy). El estatus es único por joven (como en los cuadros del cliente:
// Trabajando = permanente + temporal, Emprendiendo, Estudiando, Búsqueda de
// empleo, En pasantía), así los conteos suman el total de egresados.
//
// Filtros: corte (fecha de corte), from/to (cohorte: fecha de inicio del
// curso), project, cftp, technicalArea, estatus (grupos).

const SQL = `
  SELECT
    pm.id                                          AS matricula_id,
    CONCAT(e.nombres, ' ', e.apellidos)            AS nombre_completo,
    e.identidad                                    AS dni,
    CASE WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('M','MASCULINO','HOMBRE') THEN 'Masculino'
         WHEN UPPER(TRIM(COALESCE(e.sexo,''))) IN ('F','FEMENINO','MUJER')   THEN 'Femenino'
         ELSE e.sexo END                           AS sexo,
    c.nombre                                       AS centro,
    cu.nombre                                      AS curso,
    proc.codigo                                    AS codigo_proceso,
    EXTRACT(YEAR FROM proc.fecha_inicial)::int     AS cohorte,
    pm.fecha_resultado::text                       AS fecha_egreso,
    u.estatus,
    u.fecha_corte::text                            AS fecha_corte,
    u.empresa, u.puesto, u.rango_salario, u.negocio, u.rubro, u.rango_ingreso,
    u.kit_entregado, u.kit_monto_cents, u.institucion, u.carrera, u.observaciones,
    pa.empresa                                     AS pasantia_empresa,
    pa.resultado                                   AS pasantia_resultado,
    (SELECT STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name)
       FROM caderh.projects_processes pp JOIN caderh.projects p ON p.id = pp.project_id
      WHERE pp.process_id = proc.id AND p.project_status <> 'DELETED') AS proyectos
  FROM centros.proceso_matriculas pm
  JOIN centros.procesos proc  ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
  JOIN centros.estudiantes e  ON e.id = pm.estudiante_id
  JOIN centros.centros c      ON c.id = proc.centro_id
  JOIN centros.cursos cu      ON cu.id = proc.curso_id
  LEFT JOIN LATERAL (
    SELECT s.* FROM centros.seguimientos s
     WHERE s.proceso_matricula_id = pm.id AND s.fecha_corte <= $1::date
     ORDER BY s.fecha_corte DESC LIMIT 1
  ) u ON true
  LEFT JOIN centros.pasantias pa ON pa.proceso_matricula_id = pm.id
  WHERE pm.estatus = 1
    AND pm.resultado = 'EGRESADO'
    AND pm.fecha_resultado <= $1::date
    AND ($2::date   IS NULL OR proc.fecha_inicial >= $2)
    AND ($3::date   IS NULL OR proc.fecha_inicial <= $3)
    AND ($4::uuid[] IS NULL OR EXISTS (
          SELECT 1 FROM caderh.projects_processes pp
           WHERE pp.process_id = proc.id AND pp.project_id = ANY($4::uuid[])))
    AND ($5::int[]  IS NULL OR proc.centro_id = ANY($5::int[]))
    AND ($6::int[]  IS NULL OR EXISTS (
          SELECT 1 FROM centros.curso_areas ca
           WHERE ca.curso_id = proc.curso_id AND ca.area_id = ANY($6::int[])))
  ORDER BY cohorte DESC, c.nombre, cu.nombre, e.apellidos, e.nombres
`;

const GRUPOS = ['TRABAJANDO', 'EMPRENDIENDO', 'ESTUDIANDO', 'BUSQUEDA_EMPLEO', 'EN_PASANTIA', 'OTRO', 'SIN_SEGUIMIENTO'];

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

// Lugar y detalle según el estatus: empresa si trabaja, negocio si emprende,
// centro educativo si estudia.
function lugarYDetalle(r) {
  switch (GRUPO_ESTATUS[r.estatus]) {
    case 'TRABAJANDO': return { lugar: r.empresa, detalle: r.puesto, rango: r.rango_salario };
    case 'EMPRENDIENDO': return { lugar: r.negocio, detalle: r.rubro, rango: r.rango_ingreso };
    case 'ESTUDIANDO': return { lugar: r.institucion, detalle: r.carrera, rango: null };
    default: return { lugar: null, detalle: null, rango: null };
  }
}

export const handler = reportHandler(async (req) => {
  const q = req.query;
  const corte = parseIsoDate(q.corte) ?? hoyIso();
  const grupos = parseEnumList(q.estatus, GRUPOS);
  const [rows] = await sequelize.query(SQL, {
    bind: [
      corte,                              // $1
      parseIsoDate(q.from),               // $2
      parseIsoDate(q.to),                 // $3
      parseUuidList(q.project),           // $4
      parseIntList(q.cftp),               // $5
      parseIntList(q.technicalArea),      // $6
    ],
  });

  const conGrupo = rows.map((r) => ({ ...r, grupo: r.estatus ? GRUPO_ESTATUS[r.estatus] : 'SIN_SEGUIMIENTO' }));
  const conteo = Object.fromEntries(GRUPOS.map((g) => [g, 0]));
  for (const r of conGrupo) conteo[r.grupo]++;
  const totalEgresados = conGrupo.length;

  const filtradas = grupos ? conGrupo.filter((r) => grupos.includes(r.grupo)) : conGrupo;
  const out = filtradas.map((r, i) => {
    const ld = lugarYDetalle(r);
    return {
      num: i + 1,
      nombre_completo: r.nombre_completo,
      dni: r.dni,
      sexo: r.sexo,
      centro: r.centro,
      curso: r.curso,
      codigo_proceso: r.codigo_proceso,
      cohorte: r.cohorte,
      fecha_egreso: r.fecha_egreso,
      estatus: r.estatus ? ESTATUS_SEGUIMIENTO[r.estatus] : 'Sin seguimiento',
      grupo: r.grupo,
      fecha_corte: r.fecha_corte,
      lugar: ld.lugar,
      detalle: ld.detalle,
      rango: ld.rango,
      kit: r.estatus === 'EMPRENDIENDO' && r.kit_entregado != null
        ? (r.kit_entregado ? (r.kit_monto_cents != null ? `Sí · L ${(Number(r.kit_monto_cents) / 100).toLocaleString('es-HN', { minimumFractionDigits: 2 })}` : 'Sí') : 'No')
        : null,
      pasantia: r.pasantia_empresa || r.pasantia_resultado
        ? [r.pasantia_empresa, r.pasantia_resultado ? RESULTADOS_PASANTIA[r.pasantia_resultado] : null].filter(Boolean).join(' · ')
        : null,
      proyectos: r.proyectos ?? '',
      observaciones: r.observaciones,
    };
  });

  return {
    rows: out,
    total: out.length,
    kpis: {
      egresados: totalEgresados,
      trabajando: conteo.TRABAJANDO,
      emprendiendo: conteo.EMPRENDIENDO,
      estudiando: conteo.ESTUDIANDO,
      busqueda: conteo.BUSQUEDA_EMPLEO,
      pasantia: conteo.EN_PASANTIA,
      otro: conteo.OTRO,
      sinSeguimiento: conteo.SIN_SEGUIMIENTO,
      pctTrabajando: pct(conteo.TRABAJANDO, totalEgresados),
      pctEmprendiendo: pct(conteo.EMPRENDIENDO, totalEgresados),
      pctEstudiando: pct(conteo.ESTUDIANDO, totalEgresados),
    },
    meta: { corte },
  };
});
