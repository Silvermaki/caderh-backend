import { sequelize } from '../../../utils/sequelize.js';
import {
  reportHandler, parseUuidList, parseIntList, parseIsoDate, GENERO_SQL,
} from '../shared.js';

// R3 · % de retención.
//
// Una fila por CURSO (proceso educativo). La fuente es el CIERRE de cada
// matrícula (proceso_matriculas.resultado, migración 1772360000000):
//   · Matrícula inicial = matrículas activas del curso.
//   · Egresados = resultado EGRESADO · Desertores = DESERTOR.
//   · Sin cierre = matrículas sin resultado registrado (cursos en marcha o
//     cierres pendientes): se muestran aparte para no inflar la deserción.
//   · % de retención = egresados ÷ (egresados + desertores), es decir, sobre
//     las matrículas con cierre registrado. Con todo cerrado equivale a
//     egresados ÷ matrícula inicial (meta PriceSmart: 85 % completan).
//
// Filtros: from/to (fecha de inicio del curso), project, financingSource,
// cftp, technicalArea. Proyecto y fuente con EXISTS (un proceso puede estar en
// varios proyectos y no debe contarse dos veces).

const SQL = `
  WITH base AS (
    SELECT
      proc.id                       AS proceso_id,
      proc.codigo,
      proc.fecha_inicial,
      proc.fecha_final,
      c.nombre                      AS centro_nombre,
      c.siglas                      AS centro_siglas,
      cu.nombre                     AS curso_nombre,
      (SELECT a.nombre FROM centros.curso_areas ca JOIN centros.areas a ON a.id = ca.area_id
        WHERE ca.curso_id = cu.id ORDER BY ca.id LIMIT 1) AS area,
      ${GENERO_SQL('e.sexo')}       AS genero,
      pm.resultado
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc  ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
    JOIN centros.centros c      ON c.id = proc.centro_id
    JOIN centros.cursos cu      ON cu.id = proc.curso_id
    JOIN centros.estudiantes e  ON e.id = pm.estudiante_id
    WHERE pm.estatus = 1
      AND ($1::date   IS NULL OR proc.fecha_inicial >= $1)
      AND ($2::date   IS NULL OR proc.fecha_inicial <= $2)
      AND ($3::uuid[] IS NULL OR EXISTS (
            SELECT 1 FROM caderh.projects_processes pp
             WHERE pp.process_id = proc.id AND pp.project_id = ANY($3::uuid[])))
      AND ($4::uuid[] IS NULL OR EXISTS (
            SELECT 1 FROM caderh.projects_processes pp
              JOIN caderh.project_financing_sources pfs ON pfs.project_id = pp.project_id
             WHERE pp.process_id = proc.id AND pfs.financing_source_id = ANY($4::uuid[])))
      AND ($5::int[]  IS NULL OR proc.centro_id = ANY($5::int[]))
      AND ($6::int[]  IS NULL OR EXISTS (
            SELECT 1 FROM centros.curso_areas ca2
             WHERE ca2.curso_id = cu.id AND ca2.area_id = ANY($6::int[])))
  )
  SELECT
    proceso_id, codigo, fecha_inicial::text AS fecha_inicial, fecha_final::text AS fecha_final,
    (fecha_final < CURRENT_DATE) AS terminado,
    centro_nombre, centro_siglas, curso_nombre, area,
    COUNT(*) FILTER (WHERE genero = 'M')::int                              AS h_inicial,
    COUNT(*) FILTER (WHERE genero = 'F')::int                              AS m_inicial,
    COUNT(*)::int                                                          AS total_inicial,
    COUNT(*) FILTER (WHERE resultado = 'EGRESADO' AND genero = 'M')::int   AS h_egresados,
    COUNT(*) FILTER (WHERE resultado = 'EGRESADO' AND genero = 'F')::int   AS m_egresados,
    COUNT(*) FILTER (WHERE resultado = 'EGRESADO')::int                    AS total_egresados,
    COUNT(*) FILTER (WHERE resultado = 'DESERTOR')::int                    AS desertores,
    COUNT(*) FILTER (WHERE resultado IS NULL)::int                         AS sin_cierre
  FROM base
  GROUP BY proceso_id, codigo, fecha_inicial, fecha_final, centro_nombre, centro_siglas, curso_nombre, area
  ORDER BY centro_nombre, fecha_inicial, curso_nombre, codigo
`;

const retencion = (egresados, desertores) => {
  const cerrados = egresados + desertores;
  return cerrados > 0 ? Math.round((egresados / cerrados) * 1000) / 10 : null;
};

export const handler = reportHandler(async (req) => {
  const q = req.query;
  const [rows] = await sequelize.query(SQL, {
    bind: [
      parseIsoDate(q.from),               // $1
      parseIsoDate(q.to),                 // $2
      parseUuidList(q.project),           // $3
      parseUuidList(q.financingSource),   // $4
      parseIntList(q.cftp),               // $5
      parseIntList(q.technicalArea),      // $6
    ],
  });

  const out = rows.map((r) => ({
    centro: r.centro_siglas ? `${r.centro_siglas} — ${r.centro_nombre}` : r.centro_nombre,
    curso: r.curso_nombre,
    codigo: r.codigo,
    areaTecnica: r.area ?? '—',
    inicio: r.fecha_inicial,
    fin: r.fecha_final,
    estado: r.terminado ? 'Terminado' : 'En curso',
    hombresInicial: r.h_inicial,
    mujeresInicial: r.m_inicial,
    totalInicial: r.total_inicial,
    hombresEgresados: r.h_egresados,
    mujeresEgresados: r.m_egresados,
    totalEgresados: r.total_egresados,
    desertores: r.desertores,
    sinCierre: r.sin_cierre,
    pctRetencion: retencion(r.total_egresados, r.desertores),
  }));

  const sum = (k) => out.reduce((s, r) => s + (r[k] ?? 0), 0);
  const totalEgresados = sum('totalEgresados');
  const totalDesertores = sum('desertores');

  return {
    rows: out,
    total: out.length,
    totals: {
      hombresInicial: sum('hombresInicial'),
      mujeresInicial: sum('mujeresInicial'),
      totalInicial: sum('totalInicial'),
      hombresEgresados: sum('hombresEgresados'),
      mujeresEgresados: sum('mujeresEgresados'),
      totalEgresados,
      desertores: totalDesertores,
      sinCierre: sum('sinCierre'),
      pctRetencion: retencion(totalEgresados, totalDesertores),
    },
    kpis: {
      totalInicial: sum('totalInicial'),
      totalEgresados,
      totalDesertores,
      totalSinCierre: sum('sinCierre'),
      pctRetencionGlobal: retencion(totalEgresados, totalDesertores),
    },
  };
});
