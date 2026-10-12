// ─────────────────────────────────────────────────────────────────────────────
// Módulo de egresados y seguimiento (migración 1772360000000).
//
// Pensado para trabajar POR LISTAS (CADERH casi nunca entra joven por joven):
//   · Cierre de cursos: resultado de cada matrícula (egresó / desertó).
//       GET    /egresados/cierre              lista filtrable (todas las filas)
//       PATCH  /egresados/cierre              mismo resultado a varias matrículas
//       GET    /egresados/cierre/excel        lista prellenada para editar
//       POST   /egresados/cierre/excel        subir la lista editada
//   · Seguimiento: un registro por egresado y fecha de corte (historial).
//       GET    /egresados/seguimiento         egresados con su último estatus
//       POST   /egresados/seguimiento         mismo estatus a varios egresados
//       GET    /egresados/seguimiento/excel   plantilla con el último estatus
//       POST   /egresados/seguimiento/excel   subir un corte completo
//       GET    /egresados/seguimiento/:matriculaId     historial de un joven
//       PUT    /egresados/seguimiento/registro/:id     corregir un registro
//       DELETE /egresados/seguimiento/registro/:id     borrar un registro
//       PUT    /egresados/pasantia/:matriculaId        guardar la pasantía
//
// Lectura: cualquier usuario autenticado. Escritura: Administrador y
// Supervisor (mismo criterio que el resto del módulo de centros).
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import multer from "multer";
import { sequelize, user_logs, sgc_pasantias } from "../../utils/sequelize.js";
import { verify_token, is_authenticated, is_supervisor } from "../../utils/token.js";
import { toDateOnly, normalizeIdentidad } from "../../utils/normalize-captura.js";
import {
    GRUPO_ESTATUS, GRUPOS_ESTATUS,
    normalizeResultado, normalizeMotivo, normalizeResultadoPasantia, normalizeEstatus,
    normalizeRango, normalizeMontoCents, normalizeSiNo, textoOpcional,
} from "../../utils/egresados-catalogos.js";
import {
    generateCierreExcel, parseCierreExcel, generateSeguimientoExcel, parseSeguimientoExcel,
} from "../../utils/excel-egresados.js";

export const router = Router();

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILAS = 5000;

function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function intOrNull(v) {
    const n = Number(v);
    return v !== undefined && v !== null && String(v).trim() !== "" && Number.isInteger(n) ? n : null;
}

// Filtros comunes de las listas (query string → binds $1..$6).
function filtrosBase(q) {
    const proyecto = q.proyecto && UUID_RE.test(String(q.proyecto)) ? String(q.proyecto) : null;
    const search = q.search && String(q.search).trim() ? `%${String(q.search).trim()}%` : null;
    return [proyecto, intOrNull(q.centro), intOrNull(q.proceso), intOrNull(q.anio), search, intOrNull(q.curso)];
}

// Matrículas activas de procesos activos y no cancelados, con su contexto.
const BASE_CTE = `
  base AS (
    SELECT pm.id                          AS matricula_id,
           pm.resultado,
           pm.fecha_resultado::text       AS fecha_resultado,
           pm.motivo_desercion,
           pm.observacion_resultado,
           e.id                           AS estudiante_id,
           e.identidad,
           CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
           e.sexo,
           proc.id                        AS proceso_id,
           proc.codigo                    AS proceso_codigo,
           proc.fecha_inicial::text       AS fecha_inicial,
           proc.fecha_final::text         AS fecha_final,
           (proc.fecha_final < CURRENT_DATE) AS terminado,
           EXTRACT(YEAR FROM proc.fecha_inicial)::int AS anio,
           c.id                           AS centro_id,
           c.nombre                       AS centro_nombre,
           cu.id                          AS curso_id,
           cu.nombre                      AS curso_nombre
      FROM centros.proceso_matriculas pm
      JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1 AND proc.cancelado = false
      JOIN centros.estudiantes e ON e.id = pm.estudiante_id
      JOIN centros.centros c     ON c.id = proc.centro_id
      JOIN centros.cursos cu     ON cu.id = proc.curso_id
     WHERE pm.estatus = 1
       AND ($1::uuid IS NULL OR EXISTS (
             SELECT 1 FROM caderh.projects_processes pp
              WHERE pp.process_id = proc.id AND pp.project_id = $1::uuid))
       AND ($2::int  IS NULL OR proc.centro_id = $2)
       AND ($3::int  IS NULL OR proc.id = $3)
       AND ($4::int  IS NULL OR EXTRACT(YEAR FROM proc.fecha_inicial) = $4)
       AND ($5::text IS NULL OR e.identidad ILIKE $5 OR CONCAT(e.nombres, ' ', e.apellidos) ILIKE $5)
       AND ($6::int  IS NULL OR proc.curso_id = $6)
  )`;

// ═══════════════════════════════════════════════════════════════════════════
// Cierre de cursos
// ═══════════════════════════════════════════════════════════════════════════

const ESTADOS_CIERRE = new Set(["SIN_CIERRE", "EGRESADO", "DESERTOR"]);

async function listarCierre(q) {
    const estado = ESTADOS_CIERRE.has(String(q.estado)) ? String(q.estado) : null;
    const soloTerminados = String(q.terminados) === "1";
    const [rows] = await sequelize.query(`
      WITH ${BASE_CTE}
      SELECT * FROM base
       WHERE ($7::text IS NULL
              OR ($7 = 'SIN_CIERRE' AND resultado IS NULL)
              OR resultado = $7)
         AND ($8::boolean = false OR terminado)
       ORDER BY fecha_final DESC, centro_nombre, curso_nombre, proceso_codigo, nombre
       LIMIT ${MAX_FILAS + 1}`,
        { bind: [...filtrosBase(q), estado, soloTerminados] });
    const [[resumen]] = await sequelize.query(`
      WITH ${BASE_CTE}
      SELECT COUNT(*)::int                                              AS total,
             COUNT(*) FILTER (WHERE resultado IS NULL)::int             AS sin_cierre,
             COUNT(*) FILTER (WHERE resultado IS NULL AND terminado)::int AS sin_cierre_terminados,
             COUNT(*) FILTER (WHERE resultado = 'EGRESADO')::int        AS egresados,
             COUNT(*) FILTER (WHERE resultado = 'DESERTOR')::int        AS desertores
        FROM base
       WHERE ($7::boolean = false OR terminado)`,
        { bind: [...filtrosBase(q), soloTerminados] });
    return { rows: rows.slice(0, MAX_FILAS), truncado: rows.length > MAX_FILAS, resumen };
}

router.get("/cierre", verify_token, is_authenticated, async (req, res, next) => {
    try {
        const { rows, truncado, resumen } = await listarCierre(req.query);
        res.status(200).json({ data: rows, truncado, resumen });
    } catch (e) {
        next(e);
    }
});

// Aplica resultados a matrículas. items: [{ matricula_id, resultado, fecha,
// motivo, observacion, _row }] con valores CRUDOS (etiquetas o códigos):
//   resultado vacío → sin cambios · "Pendiente" → quita el resultado.
// Devuelve { updated, unchanged, errors, warnings } (formato del modal de
// resultados de importación del frontend).
async function aplicarCierre(items, userId, transaction) {
    const errors = [];
    const err = (item, message) => errors.push({ row: item._row ?? null, message });
    const ids = [...new Set(items.map((i) => i.matricula_id).filter(Boolean))];
    const [matriculas] = ids.length === 0 ? [[]] : await sequelize.query(`
      SELECT pm.id, pm.resultado, pm.fecha_resultado::text AS fecha_resultado, pm.motivo_desercion,
             pm.observacion_resultado, proc.fecha_inicial::text AS fecha_inicial, proc.fecha_final::text AS fecha_final,
             CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
             (EXISTS (SELECT 1 FROM centros.seguimientos s WHERE s.proceso_matricula_id = pm.id)
              OR EXISTS (SELECT 1 FROM centros.pasantias p WHERE p.proceso_matricula_id = pm.id)) AS tiene_seguimiento
        FROM centros.proceso_matriculas pm
        JOIN centros.procesos proc ON proc.id = pm.proceso_id
        JOIN centros.estudiantes e ON e.id = pm.estudiante_id
       WHERE pm.id = ANY($1::int[]) AND pm.estatus = 1`, { bind: [ids], transaction });
    const porId = new Map(matriculas.map((m) => [Number(m.id), m]));
    const hoy = hoyIso();
    let updated = 0, unchanged = 0;

    for (const item of items) {
        const m = porId.get(Number(item.matricula_id));
        if (!m) { err(item, `Matrícula ${item.matricula_id ?? "sin ID"} no encontrada o dada de baja`); continue; }
        const quien = m.nombre;

        const r = normalizeResultado(item.resultado);
        if (r.error) { err(item, `${quien}: ${r.error}`); continue; }
        if (r.value === null) { unchanged++; continue; }

        let nuevo;
        if (r.value === "PENDIENTE") {
            if (m.tiene_seguimiento) { err(item, `${quien}: tiene seguimiento o pasantía registrados; no se puede quitar el egreso`); continue; }
            nuevo = { resultado: null, fecha_resultado: null, motivo_desercion: null, observacion_resultado: null };
        } else {
            const fechaRaw = item.fecha;
            let fecha = fechaRaw === undefined || fechaRaw === null || String(fechaRaw).trim() === "" ? null : toDateOnly(fechaRaw);
            if (fechaRaw && String(fechaRaw).trim() !== "" && !fecha) {
                err(item, `${quien}: fecha inválida "${String(fechaRaw).trim()}". Use DD/MM/AAAA`); continue;
            }
            if (r.value === "EGRESADO") {
                fecha = fecha ?? m.fecha_final;
                if (fecha > hoy) { err(item, `${quien}: el curso termina el ${m.fecha_final}; registre el egreso cuando termine o indique la fecha real`); continue; }
                nuevo = { resultado: "EGRESADO", fecha_resultado: fecha, motivo_desercion: null };
            } else {
                if (m.tiene_seguimiento) { err(item, `${quien}: tiene seguimiento o pasantía registrados; no se puede marcar como desertor`); continue; }
                if (!fecha) { err(item, `${quien}: la fecha de deserción es obligatoria`); continue; }
                if (fecha > hoy) { err(item, `${quien}: la fecha de deserción no puede ser futura`); continue; }
                const mot = normalizeMotivo(item.motivo);
                if (mot.error) { err(item, `${quien}: ${mot.error}`); continue; }
                if (!mot.value) { err(item, `${quien}: el motivo de deserción es obligatorio`); continue; }
                nuevo = { resultado: "DESERTOR", fecha_resultado: fecha, motivo_desercion: mot.value };
            }
            if (nuevo.fecha_resultado < m.fecha_inicial) {
                err(item, `${quien}: la fecha (${nuevo.fecha_resultado}) es anterior al inicio del curso (${m.fecha_inicial})`); continue;
            }
            if (item.observacion !== undefined) nuevo.observacion_resultado = textoOpcional(item.observacion, 1000);
        }

        const igual = Object.entries(nuevo).every(([k, v]) => (m[k] ?? null) === (v ?? null));
        if (igual) { unchanged++; continue; }
        await sequelize.query(`
          UPDATE centros.proceso_matriculas
             SET resultado = $2, fecha_resultado = $3, motivo_desercion = $4,
                 observacion_resultado = COALESCE($5, CASE WHEN $6 THEN NULL ELSE observacion_resultado END),
                 updated_at = now()
           WHERE id = $1`,
            {
                bind: [m.id, nuevo.resultado, nuevo.fecha_resultado, nuevo.motivo_desercion,
                    nuevo.observacion_resultado ?? null, "observacion_resultado" in nuevo],
                transaction,
            });
        Object.assign(m, nuevo);
        updated++;
    }
    if (updated > 0) {
        await user_logs.create({ user_id: userId, log: `Registró cierre de ${updated} matrícula(s)` }, { transaction });
    }
    return { updated, unchanged, errors, warnings: [] };
}

router.patch("/cierre", verify_token, is_supervisor, async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { matricula_ids, resultado, fecha_resultado, motivo_desercion, observacion } = req.body ?? {};
        if (!Array.isArray(matricula_ids) || matricula_ids.length === 0) {
            await t.rollback();
            return res.status(400).json({ message: "Seleccione al menos una matrícula" });
        }
        const items = matricula_ids.map((id) => ({
            matricula_id: Number(id),
            resultado: resultado === null ? "Pendiente" : resultado,
            fecha: fecha_resultado,
            motivo: motivo_desercion,
            observacion,
        }));
        const result = await aplicarCierre(items, req.user_id, t);
        await t.commit();
        res.status(200).json(result);
    } catch (e) {
        await t.rollback();
        next(e);
    }
});

router.get("/cierre/excel", verify_token, is_authenticated, async (req, res, next) => {
    try {
        const { rows } = await listarCierre(req.query);
        const wb = generateCierreExcel(rows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=cierre-cursos.xlsx");
        return wb.write("cierre-cursos.xlsx", res);
    } catch (e) {
        next(e);
    }
});

// Si la fila no trae ID de matrícula (lista armada a mano), se busca por DNI y
// código del proceso.
async function completarMatriculaPorDni(items, transaction) {
    const errors = [];
    const faltantes = items.filter((i) => !i.matricula_id);
    for (const item of faltantes) {
        const dni = normalizeIdentidad(item.identidad);
        const codigo = String(item.proceso_codigo ?? "").trim();
        if (dni.error || !codigo) {
            errors.push({ row: item._row, message: "Fila sin ID de matrícula: indique DNI y código del proceso" });
            continue;
        }
        const [rows] = await sequelize.query(`
          SELECT pm.id FROM centros.proceso_matriculas pm
            JOIN centros.procesos proc ON proc.id = pm.proceso_id AND proc.estatus = 1
            JOIN centros.estudiantes e ON e.id = pm.estudiante_id
           WHERE pm.estatus = 1 AND e.identidad = $1 AND proc.codigo = $2`,
            { bind: [dni.value, codigo], transaction });
        if (rows.length === 1) item.matricula_id = Number(rows[0].id);
        else errors.push({ row: item._row, message: rows.length === 0
            ? `No hay matrícula activa del DNI ${dni.value} en el proceso "${codigo}"`
            : `El DNI ${dni.value} tiene varias matrículas en procesos con código "${codigo}"; use la lista descargada del sistema` });
    }
    return errors;
}

router.post("/cierre/excel", verify_token, is_supervisor, excelUpload.single("file"), async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        if (!req.file) { await t.rollback(); return res.status(400).json({ message: "Archivo requerido" }); }
        const items = parseCierreExcel(req.file.buffer);
        const lookupErrors = await completarMatriculaPorDni(items, t);
        const result = await aplicarCierre(items.filter((i) => i.matricula_id), req.user_id, t);
        await t.commit();
        res.status(200).json({ ...result, errors: [...lookupErrors, ...result.errors] });
    } catch (e) {
        await t.rollback();
        next(e);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Seguimiento
// ═══════════════════════════════════════════════════════════════════════════

const ESTATUS_POR_GRUPO = Object.entries(GRUPO_ESTATUS).reduce((acc, [code, grupo]) => {
    (acc[grupo] ??= []).push(code);
    return acc;
}, {});

async function listarSeguimiento(q) {
    const grupo = q.estatus && (ESTATUS_POR_GRUPO[q.estatus] || q.estatus === "SIN_SEGUIMIENTO") ? String(q.estatus) : null;
    const codigos = grupo && grupo !== "SIN_SEGUIMIENTO" ? ESTATUS_POR_GRUPO[grupo] : null;
    const [rows] = await sequelize.query(`
      WITH ${BASE_CTE},
      egresados AS (
        SELECT b.*, row_to_json(u) AS ultimo, row_to_json(pa) AS pasantia,
               (SELECT COUNT(*) FROM centros.seguimientos s WHERE s.proceso_matricula_id = b.matricula_id)::int AS total_seguimientos,
               u.estatus AS ultimo_estatus
          FROM base b
          LEFT JOIN LATERAL (
            SELECT s.id, s.fecha_corte::text AS fecha_corte, s.estatus, s.empresa, s.puesto, s.rango_salario,
                   s.negocio, s.rubro, s.rango_ingreso, s.kit_entregado, s.kit_monto_cents, s.institucion,
                   s.carrera, s.fecha_inicio::text AS fecha_inicio, s.observaciones
              FROM centros.seguimientos s
             WHERE s.proceso_matricula_id = b.matricula_id
             ORDER BY s.fecha_corte DESC
             LIMIT 1
          ) u ON true
          LEFT JOIN LATERAL (
            SELECT p.id, p.empresa, p.fecha_inicio::text AS fecha_inicio, p.fecha_fin::text AS fecha_fin,
                   p.resultado, p.motivo_desercion, p.porcentaje_avance, p.beneficio, p.beneficio_otorgado_por,
                   p.observaciones
              FROM centros.pasantias p
             WHERE p.proceso_matricula_id = b.matricula_id
          ) pa ON true
         WHERE b.resultado = 'EGRESADO'
      )
      SELECT * FROM egresados
       WHERE ($7::text IS NULL
              OR ($7 = 'SIN_SEGUIMIENTO' AND ultimo_estatus IS NULL)
              OR ultimo_estatus = ANY($8::text[]))
       ORDER BY anio DESC, centro_nombre, curso_nombre, proceso_codigo, nombre
       LIMIT ${MAX_FILAS + 1}`,
        { bind: [...filtrosBase(q), grupo, codigos] });

    // Resumen por grupo (sobre los mismos filtros, sin el de estatus).
    const [conteos] = await sequelize.query(`
      WITH ${BASE_CTE}
      SELECT COALESCE(u.estatus, 'SIN_SEGUIMIENTO') AS estatus, COUNT(*)::int AS n
        FROM base b
        LEFT JOIN LATERAL (
          SELECT s.estatus FROM centros.seguimientos s
           WHERE s.proceso_matricula_id = b.matricula_id ORDER BY s.fecha_corte DESC LIMIT 1
        ) u ON true
       WHERE b.resultado = 'EGRESADO'
       GROUP BY 1`, { bind: filtrosBase(q) });
    const resumen = Object.fromEntries(Object.keys(GRUPOS_ESTATUS).map((g) => [g, 0]));
    let egresados = 0;
    for (const c of conteos) {
        egresados += c.n;
        const g = c.estatus === "SIN_SEGUIMIENTO" ? "SIN_SEGUIMIENTO" : GRUPO_ESTATUS[c.estatus];
        resumen[g] = (resumen[g] ?? 0) + c.n;
    }
    const [[pend]] = await sequelize.query(`
      WITH ${BASE_CTE}
      SELECT COUNT(*)::int AS n FROM base WHERE resultado IS NULL AND terminado`, { bind: filtrosBase(q) });

    return {
        rows: rows.slice(0, MAX_FILAS).map(({ ultimo_estatus, ...r }) => r),
        truncado: rows.length > MAX_FILAS,
        resumen: { egresados, ...resumen, pendientes_cierre: pend.n },
    };
}

router.get("/seguimiento", verify_token, is_authenticated, async (req, res, next) => {
    try {
        const { rows, truncado, resumen } = await listarSeguimiento(req.query);
        res.status(200).json({ data: rows, truncado, resumen });
    } catch (e) {
        next(e);
    }
});

// Detalle del corte según el estatus: solo se guarda lo que corresponde
// (empresa si trabaja, negocio si emprende, centro educativo si estudia).
function construirDetalle(estatus, d) {
    const errors = [];
    const take = (r) => { if (r.error) { errors.push(r.error); return null; } return r.value; };
    const trabaja = estatus === "TRABAJO_PERMANENTE" || estatus === "TRABAJO_TEMPORAL";
    const emprende = estatus === "EMPRENDIENDO";
    const estudia = estatus === "ESTUDIANDO";
    let fecha_inicio = null;
    if ((trabaja || emprende || estudia) && d.fecha_inicio !== undefined && d.fecha_inicio !== null && String(d.fecha_inicio).trim() !== "") {
        fecha_inicio = toDateOnly(d.fecha_inicio);
        if (!fecha_inicio) errors.push(`Fecha de inicio inválida: "${String(d.fecha_inicio).trim()}". Use DD/MM/AAAA`);
    }
    const kit = emprende ? take(normalizeSiNo(d.kit_entregado)) : null;
    const values = {
        empresa: trabaja ? textoOpcional(d.empresa) : null,
        puesto: trabaja ? textoOpcional(d.puesto) : null,
        rango_salario: trabaja ? take(normalizeRango(d.rango_salario, "Rango de salario")) : null,
        negocio: emprende ? textoOpcional(d.negocio) : null,
        rubro: emprende ? textoOpcional(d.rubro) : null,
        rango_ingreso: emprende ? take(normalizeRango(d.rango_ingreso, "Rango de ingreso")) : null,
        kit_entregado: kit,
        kit_monto_cents: emprende && kit !== false ? take(normalizeMontoCents(d.kit_monto ?? (d.kit_monto_cents != null ? Number(d.kit_monto_cents) / 100 : null), "Monto del kit")) : null,
        institucion: estudia ? textoOpcional(d.institucion) : null,
        carrera: estudia ? textoOpcional(d.carrera) : null,
        fecha_inicio,
        observaciones: textoOpcional(d.observaciones, 1000),
    };
    return { values, errors };
}

function construirPasantia(p) {
    if (!p) return { values: null, errors: [] };
    const vacio = (v) => v === undefined || v === null || String(v).trim() === "";
    if (Object.values(p).every(vacio)) return { values: null, errors: [] };
    const errors = [];
    const fecha = (v, label) => {
        if (vacio(v)) return null;
        const f = toDateOnly(v);
        if (!f) errors.push(`${label} inválida: "${String(v).trim()}". Use DD/MM/AAAA`);
        return f;
    };
    const res = vacio(p.resultado) ? { value: "EN_CURSO" } : normalizeResultadoPasantia(p.resultado);
    if (res.error) errors.push(res.error);
    const mot = res.value === "DESERTO" ? normalizeMotivo(p.motivo_desercion) : { value: null };
    if (mot.error) errors.push(mot.error);
    let avance = null;
    if (!vacio(p.porcentaje_avance)) {
        avance = Math.round(Number(String(p.porcentaje_avance).replace("%", "")));
        if (!Number.isFinite(avance) || avance < 0 || avance > 100) {
            errors.push(`% de avance de la pasantía inválido: "${String(p.porcentaje_avance).trim()}" (0 a 100)`);
            avance = null;
        }
    }
    const values = {
        empresa: textoOpcional(p.empresa),
        fecha_inicio: fecha(p.fecha_inicio, "Fecha de inicio de la pasantía"),
        fecha_fin: fecha(p.fecha_fin, "Fecha de fin de la pasantía"),
        resultado: res.value ?? "EN_CURSO",
        motivo_desercion: mot.value ?? null,
        porcentaje_avance: avance,
        beneficio: textoOpcional(p.beneficio),
        beneficio_otorgado_por: textoOpcional(p.beneficio_otorgado_por),
        observaciones: textoOpcional(p.observaciones, 1000),
    };
    if (values.fecha_inicio && values.fecha_fin && values.fecha_fin < values.fecha_inicio) {
        errors.push("La pasantía termina antes de empezar");
    }
    return { values, errors };
}

async function guardarPasantia(matriculaId, values, transaction) {
    await sequelize.query(`
      INSERT INTO centros.pasantias (proceso_matricula_id, empresa, fecha_inicio, fecha_fin, resultado, motivo_desercion,
                                     porcentaje_avance, beneficio, beneficio_otorgado_por, observaciones, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
      ON CONFLICT (proceso_matricula_id) DO UPDATE
        SET empresa = EXCLUDED.empresa, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin,
            resultado = EXCLUDED.resultado, motivo_desercion = EXCLUDED.motivo_desercion,
            porcentaje_avance = EXCLUDED.porcentaje_avance, beneficio = EXCLUDED.beneficio,
            beneficio_otorgado_por = EXCLUDED.beneficio_otorgado_por,
            observaciones = COALESCE(EXCLUDED.observaciones, centros.pasantias.observaciones),
            updated_at = now()`,
        {
            bind: [matriculaId, values.empresa, values.fecha_inicio, values.fecha_fin, values.resultado,
                values.motivo_desercion, values.porcentaje_avance, values.beneficio, values.beneficio_otorgado_por,
                values.observaciones],
            transaction,
        });
}

// Registra un corte para varias matrículas. items: [{ matricula_id, estatus,
// ...detalle crudo, pasantia?, _row }]. Estatus vacío → la fila se omite.
async function aplicarSeguimientos(fechaCorte, items, userId, transaction) {
    const errors = [];
    const warnings = [];
    const err = (item, message) => errors.push({ row: item._row ?? null, message });
    const ids = [...new Set(items.map((i) => i.matricula_id).filter(Boolean))];
    const [matriculas] = ids.length === 0 ? [[]] : await sequelize.query(`
      SELECT pm.id, pm.resultado, pm.fecha_resultado::text AS fecha_resultado, CONCAT(e.nombres, ' ', e.apellidos) AS nombre
        FROM centros.proceso_matriculas pm
        JOIN centros.estudiantes e ON e.id = pm.estudiante_id
       WHERE pm.id = ANY($1::int[]) AND pm.estatus = 1`, { bind: [ids], transaction });
    const porId = new Map(matriculas.map((m) => [Number(m.id), m]));
    let created = 0, updated = 0, omitted = 0, pasantias = 0;

    for (const item of items) {
        const m = porId.get(Number(item.matricula_id));
        if (!m) { err(item, `Matrícula ${item.matricula_id ?? "sin ID"} no encontrada o dada de baja`); continue; }
        const quien = m.nombre;
        if (m.resultado !== "EGRESADO") {
            err(item, `${quien}: registre primero su egreso en el cierre del curso`); continue;
        }

        // La pasantía se guarda aunque el estatus del corte venga vacío.
        const pas = construirPasantia(item.pasantia);
        if (pas.errors.length) { pas.errors.forEach((message) => err(item, `${quien}: ${message}`)); continue; }

        const est = normalizeEstatus(item.estatus);
        if (est.error) { err(item, `${quien}: ${est.error}`); continue; }
        let detalle = null;
        if (est.value) {
            if (fechaCorte < m.fecha_resultado) {
                err(item, `${quien}: la fecha de corte (${fechaCorte}) es anterior a su egreso (${m.fecha_resultado})`); continue;
            }
            const d = construirDetalle(est.value, item);
            if (d.errors.length) { d.errors.forEach((message) => err(item, `${quien}: ${message}`)); continue; }
            detalle = d.values;
        }

        if (pas.values) { await guardarPasantia(m.id, pas.values, transaction); pasantias++; }
        if (!est.value) { omitted++; continue; }

        const [[r]] = await sequelize.query(`
          INSERT INTO centros.seguimientos (proceso_matricula_id, fecha_corte, estatus, empresa, puesto, rango_salario,
                                            negocio, rubro, rango_ingreso, kit_entregado, kit_monto_cents, institucion,
                                            carrera, fecha_inicio, observaciones, registrado_por, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now())
          ON CONFLICT (proceso_matricula_id, fecha_corte) DO UPDATE
            SET estatus = EXCLUDED.estatus, empresa = EXCLUDED.empresa, puesto = EXCLUDED.puesto,
                rango_salario = EXCLUDED.rango_salario, negocio = EXCLUDED.negocio, rubro = EXCLUDED.rubro,
                rango_ingreso = EXCLUDED.rango_ingreso, kit_entregado = EXCLUDED.kit_entregado,
                kit_monto_cents = EXCLUDED.kit_monto_cents, institucion = EXCLUDED.institucion,
                carrera = EXCLUDED.carrera, fecha_inicio = EXCLUDED.fecha_inicio,
                observaciones = EXCLUDED.observaciones, registrado_por = EXCLUDED.registrado_por, updated_at = now()
          RETURNING (xmax = 0) AS inserted`,
            {
                bind: [m.id, fechaCorte, est.value, detalle.empresa, detalle.puesto, detalle.rango_salario,
                    detalle.negocio, detalle.rubro, detalle.rango_ingreso, detalle.kit_entregado, detalle.kit_monto_cents,
                    detalle.institucion, detalle.carrera, detalle.fecha_inicio, detalle.observaciones,
                    UUID_RE.test(String(userId)) ? userId : null],
                transaction,
            });
        if (r.inserted) created++; else updated++;
    }
    if (omitted > 0) warnings.push({ id: null, message: `${omitted} fila(s) sin estatus: no se registró corte para esos jóvenes` });
    if (pasantias > 0) warnings.push({ id: null, message: `Se guardó la pasantía de ${pasantias} joven(es)` });
    if (created + updated > 0) {
        await user_logs.create({ user_id: userId, log: `Registró seguimiento al ${fechaCorte}: ${created} nuevo(s), ${updated} actualizado(s)` }, { transaction });
    }
    return { created, updated, errors, warnings };
}

function fechaCorteValida(raw) {
    const f = toDateOnly(raw);
    if (!f) return { error: "Indique una fecha de corte válida" };
    if (f > hoyIso()) return { error: "La fecha de corte no puede ser futura" };
    return { value: f };
}

router.post("/seguimiento", verify_token, is_supervisor, async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const b = req.body ?? {};
        const corte = fechaCorteValida(b.fecha_corte);
        if (corte.error) { await t.rollback(); return res.status(400).json({ message: corte.error }); }
        if (!Array.isArray(b.matricula_ids) || b.matricula_ids.length === 0) {
            await t.rollback(); return res.status(400).json({ message: "Seleccione al menos un egresado" });
        }
        if (!b.estatus) { await t.rollback(); return res.status(400).json({ message: "Seleccione el estatus" }); }
        const items = b.matricula_ids.map((id) => ({ ...b, matricula_id: Number(id), pasantia: undefined }));
        const result = await aplicarSeguimientos(corte.value, items, req.user_id, t);
        await t.commit();
        res.status(200).json(result);
    } catch (e) {
        await t.rollback();
        next(e);
    }
});

router.get("/seguimiento/excel", verify_token, is_authenticated, async (req, res, next) => {
    try {
        const { rows } = await listarSeguimiento(req.query);
        const wb = generateSeguimientoExcel(rows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=seguimiento-egresados.xlsx");
        return wb.write("seguimiento-egresados.xlsx", res);
    } catch (e) {
        next(e);
    }
});

router.post("/seguimiento/excel", verify_token, is_supervisor, excelUpload.single("file"), async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        if (!req.file) { await t.rollback(); return res.status(400).json({ message: "Archivo requerido" }); }
        const corte = fechaCorteValida(req.body?.fecha_corte);
        if (corte.error) { await t.rollback(); return res.status(400).json({ message: corte.error }); }
        const items = parseSeguimientoExcel(req.file.buffer);
        const lookupErrors = await completarMatriculaPorDni(items, t);
        const result = await aplicarSeguimientos(corte.value, items.filter((i) => i.matricula_id), req.user_id, t);
        await t.commit();
        res.status(200).json({ ...result, errors: [...lookupErrors, ...result.errors] });
    } catch (e) {
        await t.rollback();
        next(e);
    }
});

router.get("/seguimiento/:matriculaId", verify_token, is_authenticated, async (req, res, next) => {
    try {
        const id = Number(req.params.matriculaId);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Matrícula inválida" });
        const [[matricula]] = await sequelize.query(`
          SELECT pm.id AS matricula_id, pm.resultado, pm.fecha_resultado::text AS fecha_resultado,
                 pm.motivo_desercion, pm.observacion_resultado,
                 e.id AS estudiante_id, e.identidad, CONCAT(e.nombres, ' ', e.apellidos) AS nombre, e.sexo,
                 e.celular, e.email,
                 proc.id AS proceso_id, proc.codigo AS proceso_codigo, proc.fecha_inicial::text AS fecha_inicial,
                 proc.fecha_final::text AS fecha_final, c.nombre AS centro_nombre, cu.nombre AS curso_nombre
            FROM centros.proceso_matriculas pm
            JOIN centros.procesos proc ON proc.id = pm.proceso_id
            JOIN centros.estudiantes e ON e.id = pm.estudiante_id
            JOIN centros.centros c ON c.id = proc.centro_id
            JOIN centros.cursos cu ON cu.id = proc.curso_id
           WHERE pm.id = $1`, { bind: [id] });
        if (!matricula) return res.status(404).json({ message: "Matrícula no encontrada" });
        const [seguimientos] = await sequelize.query(`
          SELECT s.id, s.fecha_corte::text AS fecha_corte, s.estatus, s.empresa, s.puesto, s.rango_salario, s.negocio,
                 s.rubro, s.rango_ingreso, s.kit_entregado, s.kit_monto_cents, s.institucion, s.carrera,
                 s.fecha_inicio::text AS fecha_inicio, s.observaciones, u.name AS registrado_por_nombre, s.updated_at
            FROM centros.seguimientos s
            LEFT JOIN caderh.users u ON u.id = s.registrado_por
           WHERE s.proceso_matricula_id = $1
           ORDER BY s.fecha_corte DESC`, { bind: [id] });
        const pasantia = await sgc_pasantias.findOne({ where: { proceso_matricula_id: id }, raw: true });
        res.status(200).json({ data: { ...matricula, seguimientos, pasantia } });
    } catch (e) {
        next(e);
    }
});

router.put("/seguimiento/registro/:id", verify_token, is_supervisor, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const b = req.body ?? {};
        const corte = fechaCorteValida(b.fecha_corte);
        if (corte.error) return res.status(400).json({ message: corte.error });
        const est = normalizeEstatus(b.estatus);
        if (est.error || !est.value) return res.status(400).json({ message: est.error ?? "Seleccione el estatus" });
        const d = construirDetalle(est.value, b);
        if (d.errors.length) return res.status(400).json({ message: d.errors.join(". ") });
        const [[actual]] = await sequelize.query(`
          SELECT s.id, pm.fecha_resultado::text AS fecha_resultado FROM centros.seguimientos s
            JOIN centros.proceso_matriculas pm ON pm.id = s.proceso_matricula_id WHERE s.id = $1`, { bind: [id] });
        if (!actual) return res.status(404).json({ message: "Registro no encontrado" });
        if (actual.fecha_resultado && corte.value < actual.fecha_resultado) {
            return res.status(400).json({ message: `La fecha de corte es anterior al egreso (${actual.fecha_resultado})` });
        }
        const v = d.values;
        await sequelize.query(`
          UPDATE centros.seguimientos
             SET fecha_corte = $2, estatus = $3, empresa = $4, puesto = $5, rango_salario = $6, negocio = $7, rubro = $8,
                 rango_ingreso = $9, kit_entregado = $10, kit_monto_cents = $11, institucion = $12, carrera = $13,
                 fecha_inicio = $14, observaciones = $15, registrado_por = $16, updated_at = now()
           WHERE id = $1`,
            {
                bind: [id, corte.value, est.value, v.empresa, v.puesto, v.rango_salario, v.negocio, v.rubro,
                    v.rango_ingreso, v.kit_entregado, v.kit_monto_cents, v.institucion, v.carrera, v.fecha_inicio,
                    v.observaciones, UUID_RE.test(String(req.user_id)) ? req.user_id : null],
            });
        await user_logs.create({ user_id: req.user_id, log: `Actualizó seguimiento ID: ${id}` });
        res.status(200).json({ ok: true });
    } catch (e) {
        if (e.name === "SequelizeUniqueConstraintError" || /seguimientos_corte_uq/.test(e.message)) {
            return res.status(409).json({ message: "Ya existe un registro de este joven con esa fecha de corte" });
        }
        next(e);
    }
});

router.delete("/seguimiento/registro/:id", verify_token, is_supervisor, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [, meta] = await sequelize.query(`DELETE FROM centros.seguimientos WHERE id = $1`, { bind: [id] });
        if (!meta?.rowCount) return res.status(404).json({ message: "Registro no encontrado" });
        await user_logs.create({ user_id: req.user_id, log: `Eliminó seguimiento ID: ${id}` });
        res.status(200).json({ ok: true });
    } catch (e) {
        next(e);
    }
});

router.put("/pasantia/:matriculaId", verify_token, is_supervisor, async (req, res, next) => {
    try {
        const id = Number(req.params.matriculaId);
        const [[m]] = await sequelize.query(
            `SELECT id, resultado FROM centros.proceso_matriculas WHERE id = $1 AND estatus = 1`, { bind: [id] });
        if (!m) return res.status(404).json({ message: "Matrícula no encontrada" });
        if (m.resultado !== "EGRESADO") return res.status(400).json({ message: "Registre primero el egreso del joven" });
        const p = construirPasantia(req.body ?? {});
        if (p.errors.length) return res.status(400).json({ message: p.errors.join(". ") });
        if (!p.values) {
            await sequelize.query(`DELETE FROM centros.pasantias WHERE proceso_matricula_id = $1`, { bind: [id] });
        } else {
            await guardarPasantia(id, p.values);
        }
        await user_logs.create({ user_id: req.user_id, log: `Actualizó pasantía de la matrícula ID: ${id}` });
        res.status(200).json({ ok: true });
    } catch (e) {
        next(e);
    }
});
