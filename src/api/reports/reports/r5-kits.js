import { sequelize } from '../../../utils/sequelize.js';
import {
  reportHandler, parseUuidList, parseIntList, parseIsoDate, parseEnumList, GENERO_SQL,
} from '../shared.js';
import { ESTATUS_SEGUIMIENTO } from '../../../utils/egresados-catalogos.js';

// R5 · Kits de emprendimiento entregados.
//
// Una fila por EGRESADO que recibió kit, según su seguimiento (Centros →
// Egresados → Seguimiento: estatus "Emprendiendo" con "¿Recibió kit de
// emprendimiento?" = Sí):
//   · Kit registrado el = primer corte de seguimiento en que se registró el kit;
//     emprendimiento y rubro salen de ese mismo registro.
//   · Monto = el primero informado en los registros con kit (puede completarse
//     en un corte posterior).
//   · Situación actual = estatus del último seguimiento registrado.
//
// Filtros: from/to (fecha en que se registró el kit), project, cftp,
// technicalArea, gender.

const SQL = `
  WITH kit AS (
    SELECT DISTINCT ON (s.proceso_matricula_id)
           s.proceso_matricula_id, s.fecha_corte, s.negocio, s.rubro
      FROM centros.seguimientos s
     WHERE s.estatus = 'EMPRENDIENDO' AND s.kit_entregado = true
     ORDER BY s.proceso_matricula_id, s.fecha_corte
  )
  SELECT
    CONCAT(e.nombres, ' ', e.apellidos)            AS nombre_completo,
    e.identidad                                    AS dni,
    ${GENERO_SQL('e.sexo')}                        AS genero,
    c.nombre                                       AS centro,
    c.siglas                                       AS centro_siglas,
    cu.nombre                                      AS curso,
    proc.codigo                                    AS codigo_proceso,
    kit.fecha_corte::text                          AS fecha_kit,
    kit.negocio,
    kit.rubro,
    (SELECT s2.kit_monto_cents FROM centros.seguimientos s2
      WHERE s2.proceso_matricula_id = kit.proceso_matricula_id
        AND s2.kit_entregado = true AND s2.kit_monto_cents IS NOT NULL
      ORDER BY s2.fecha_corte LIMIT 1)             AS monto_cents,
    u.estatus                                      AS estatus_actual,
    u.fecha_corte::text                            AS fecha_ultimo,
    (SELECT STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name)
       FROM caderh.projects_processes pp JOIN caderh.projects p ON p.id = pp.project_id
      WHERE pp.process_id = proc.id AND p.project_status <> 'DELETED') AS proyectos
  FROM kit
  JOIN centros.proceso_matriculas pm ON pm.id = kit.proceso_matricula_id
                                    AND pm.estatus = 1 AND pm.resultado = 'EGRESADO'
  JOIN centros.procesos proc  ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
  JOIN centros.estudiantes e  ON e.id = pm.estudiante_id
  JOIN centros.centros c      ON c.id = proc.centro_id
  JOIN centros.cursos cu      ON cu.id = proc.curso_id
  LEFT JOIN LATERAL (
    SELECT s.estatus, s.fecha_corte FROM centros.seguimientos s
     WHERE s.proceso_matricula_id = pm.id
     ORDER BY s.fecha_corte DESC LIMIT 1
  ) u ON true
  WHERE ($1::date   IS NULL OR kit.fecha_corte >= $1)
    AND ($2::date   IS NULL OR kit.fecha_corte <= $2)
    AND ($3::uuid[] IS NULL OR EXISTS (
          SELECT 1 FROM caderh.projects_processes pp
           WHERE pp.process_id = proc.id AND pp.project_id = ANY($3::uuid[])))
    AND ($4::int[]  IS NULL OR proc.centro_id = ANY($4::int[]))
    AND ($5::int[]  IS NULL OR EXISTS (
          SELECT 1 FROM centros.curso_areas ca
           WHERE ca.curso_id = proc.curso_id AND ca.area_id = ANY($5::int[])))
    AND ($6::text[] IS NULL OR (${GENERO_SQL('e.sexo')}) = ANY($6::text[]))
  ORDER BY kit.fecha_corte DESC, c.nombre, e.apellidos, e.nombres
`;

// Sin kits en todo el sistema, un reporte vacío no se debe a los filtros:
// aún no se registran en el seguimiento (el frontend lo explica).
const HAY_KITS_SQL = `
  SELECT EXISTS (
    SELECT 1
      FROM centros.seguimientos s
      JOIN centros.proceso_matriculas pm ON pm.id = s.proceso_matricula_id AND pm.estatus = 1
      JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
     WHERE s.estatus = 'EMPRENDIENDO' AND s.kit_entregado = true
  ) AS hay
`;

export const handler = reportHandler(async (req) => {
  const q = req.query;
  const [rows] = await sequelize.query(SQL, {
    bind: [
      parseIsoDate(q.from),                 // $1
      parseIsoDate(q.to),                   // $2
      parseUuidList(q.project),             // $3
      parseIntList(q.cftp),                 // $4
      parseIntList(q.technicalArea),        // $5
      parseEnumList(q.gender, ['M', 'F']),  // $6
    ],
  });

  const out = rows.map((r, i) => ({
    num: i + 1,
    nombre_completo: r.nombre_completo,
    dni: r.dni,
    sexo: r.genero === 'M' ? 'Masculino' : r.genero === 'F' ? 'Femenino' : null,
    centro: r.centro,
    centro_siglas: r.centro_siglas,
    curso: r.curso,
    codigo_proceso: r.codigo_proceso,
    proyectos: r.proyectos ?? '',
    negocio: r.negocio,
    rubro: r.rubro,
    monto: r.monto_cents != null ? Number(r.monto_cents) / 100 : null,
    fecha_kit: r.fecha_kit,
    situacion: r.estatus_actual ? ESTATUS_SEGUIMIENTO[r.estatus_actual] : null,
    fecha_ultimo: r.fecha_ultimo,
  }));

  // Montos en centavos para no acumular error de redondeo.
  const centavos = rows.filter((r) => r.monto_cents != null).map((r) => Number(r.monto_cents));
  const totalCents = centavos.reduce((s, c) => s + c, 0);

  let hayKits = out.length > 0;
  if (!hayKits) {
    const [[{ hay }]] = await sequelize.query(HAY_KITS_SQL);
    hayKits = hay;
  }

  return {
    rows: out,
    total: out.length,
    totals: { monto: totalCents / 100 },
    kpis: {
      kits: out.length,
      montoTotal: totalCents / 100,
      montoPromedio: centavos.length ? Math.round(totalCents / centavos.length) / 100 : 0,
      siguenEmprendiendo: rows.filter((r) => r.estatus_actual === 'EMPRENDIENDO').length,
    },
    meta: { hayKits },
  };
});
