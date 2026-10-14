import { sequelize } from '../../../utils/sequelize.js';
import {
  reportHandler, parseUuidList, parseIntList, parseIntValue, parseIsoDate, GENERO_SQL,
} from '../shared.js';

// R1 · Consolidado matrícula por CFP.
//
// Una fila por CURSO (cohorte = proceso educativo), agrupada por área técnica →
// centro, con subtotal por área: es la forma del "Resumen Consolidado" del
// Anexo I del cliente y lo que pidieron en las notas del 18/08/2026 ("reporte
// por área, por centro, hombre y mujer"; "ahorita lo muestra por edad").
//
//   · La edad es un FILTRO (rango), ya no una dimensión de la fila.
//   · Sin "F. Normal / F. Dual": CADERH no maneja ese dato (decisión 12/10).
//   · Ciudad = municipio donde se imparte el curso (cursos.municipio_id) y, si
//     no está registrado, el del centro. "Lugar" es el texto libre del proceso.
//   · Proyecto y fuente se filtran con EXISTS: un proceso puede estar en varios
//     proyectos y no debe contarse dos veces.
//
// Filtros: from/to (período: cursos en marcha o terminados en el rango, como
// define la AC-R-022), project, financingSource, cftp, technicalArea, city
// (municipio), age_min/age_max (edad al iniciar el curso).

const SQL = `
  WITH mat AS (
    SELECT
      proc.id                                   AS proceso_id,
      proc.codigo,
      proc.fecha_inicial,
      proc.fecha_final,
      proc.lugar,
      c.id                                      AS centro_id,
      c.nombre                                  AS centro_nombre,
      c.siglas                                  AS centro_siglas,
      cu.nombre                                 AS curso_nombre,
      COALESCE(mcu.nombre, mce.nombre)          AS ciudad,
      (SELECT a.nombre FROM centros.curso_areas ca
         JOIN centros.areas a ON a.id = ca.area_id
        WHERE ca.curso_id = cu.id ORDER BY ca.id LIMIT 1) AS area,
      ${GENERO_SQL('e.sexo')}                   AS genero,
      DATE_PART('year', AGE(proc.fecha_inicial, e.fecha_nacimiento))::int AS edad
    FROM centros.proceso_matriculas pm
    JOIN centros.procesos proc  ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
    JOIN centros.centros c      ON c.id = proc.centro_id
    JOIN centros.cursos cu      ON cu.id = proc.curso_id
    JOIN centros.estudiantes e  ON e.id = pm.estudiante_id
    LEFT JOIN centros.municipios mcu ON mcu.id = cu.municipio_id
    LEFT JOIN centros.municipios mce ON mce.id = c.municipio_id
    WHERE pm.estatus = 1
      -- Período (AC-R-022, "cursos en proceso o terminados"): el curso se cruza
      -- con [desde, hasta]; entran los que ya venían en marcha.
      AND ($1::date   IS NULL OR proc.fecha_final IS NULL OR proc.fecha_final >= $1)
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
      AND ($7::int[]  IS NULL OR COALESCE(cu.municipio_id, c.municipio_id) = ANY($7::int[]))
  )
  SELECT
    area, centro_id, centro_nombre, centro_siglas, ciudad, lugar, proceso_id, codigo, curso_nombre,
    fecha_inicial::text AS fecha_inicial, fecha_final::text AS fecha_final,
    (SELECT STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name)
       FROM caderh.projects_processes pp
       JOIN caderh.projects p ON p.id = pp.project_id
      WHERE pp.process_id = mat.proceso_id AND p.project_status <> 'DELETED') AS proyectos,
    COUNT(*) FILTER (WHERE genero = 'M')::int AS hombres,
    COUNT(*) FILTER (WHERE genero = 'F')::int AS mujeres,
    COUNT(*)::int                              AS total
  FROM mat
  WHERE ($8::int IS NULL OR edad >= $8)
    AND ($9::int IS NULL OR edad <= $9)
  GROUP BY area, centro_id, centro_nombre, centro_siglas, ciudad, lugar, proceso_id, codigo, curso_nombre,
           fecha_inicial, fecha_final
  ORDER BY area NULLS LAST, centro_nombre, fecha_inicial, curso_nombre, codigo
`;

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const SIN_AREA = 'Sin área técnica';

export const handler = reportHandler(async (req) => {
  const q = req.query;
  const [rows] = await sequelize.query(SQL, {
    bind: [
      parseIsoDate(q.from),                 // $1
      parseIsoDate(q.to),                   // $2
      parseUuidList(q.project),             // $3
      parseUuidList(q.financingSource),     // $4
      parseIntList(q.cftp),                 // $5
      parseIntList(q.technicalArea),        // $6
      parseIntList(q.city),                 // $7
      parseIntValue(q.age_min),             // $8
      parseIntValue(q.age_max),             // $9
    ],
  });

  // Filas de detalle + subtotal por área (rowKind: 'subtotal').
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const area = rows[i].area ?? SIN_AREA;
    let h = 0, m = 0, t = 0, cursos = 0;
    while (i < rows.length && (rows[i].area ?? SIN_AREA) === area) {
      const r = rows[i];
      out.push({
        areaTecnica: area,
        centro: r.centro_siglas ? `${r.centro_siglas} — ${r.centro_nombre}` : r.centro_nombre,
        ciudad: r.ciudad ?? '—',
        lugar: r.lugar ?? '',
        curso: r.curso_nombre,
        codigo: r.codigo,
        inicio: r.fecha_inicial,
        fin: r.fecha_final,
        proyectos: r.proyectos ?? '',
        hombres: r.hombres,
        mujeres: r.mujeres,
        total: r.total,
        pctMujeres: pct(r.mujeres, r.total),
      });
      h += r.hombres; m += r.mujeres; t += r.total; cursos++;
      i++;
    }
    out.push({
      rowKind: 'subtotal',
      areaTecnica: `Subtotal · ${area}`,
      centro: `${cursos} curso(s)`,
      ciudad: '', lugar: '', curso: '', codigo: '', inicio: '', fin: '', proyectos: '',
      hombres: h, mujeres: m, total: t, pctMujeres: pct(m, t),
    });
  }

  const totalHombres = rows.reduce((s, r) => s + r.hombres, 0);
  const totalMujeres = rows.reduce((s, r) => s + r.mujeres, 0);
  const totalGeneral = rows.reduce((s, r) => s + r.total, 0);

  return {
    rows: out,
    total: out.length,
    totals: {
      hombres: totalHombres,
      mujeres: totalMujeres,
      total: totalGeneral,
      pctMujeres: pct(totalMujeres, totalGeneral),
    },
    kpis: {
      cursos: rows.length,
      totalHombres,
      totalMujeres,
      totalGeneral,
      pctMujeres: pct(totalMujeres, totalGeneral),
    },
  };
});
