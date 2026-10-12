// ─────────────────────────────────────────────────────────────────────────────
// Excel del módulo de egresados y seguimiento: CADERH trabaja por listas
// (descargar prellenado → editar → subir), casi nunca joven por joven.
//
//   · Lista de cierre: una fila por matrícula con su resultado (Egresó /
//     Desertó / Pendiente), fecha y motivo.
//   · Plantilla de seguimiento: una fila por egresado con su ÚLTIMO estatus ya
//     escrito (cada corte es la foto completa, como su "SEGUIMIENTO DE EMPLEO")
//     más el detalle según el estatus y los datos de la pasantía.
// ─────────────────────────────────────────────────────────────────────────────

import xl from "excel4node";
import { createStyles, writeCell, writeCatalogSheet, addListValidation, readFirstSheet } from "./excel-centros.js";
import {
    RESULTADOS, MOTIVOS_DESERCION, RESULTADOS_PASANTIA, ESTATUS_SEGUIMIENTO, RANGOS_INGRESO,
} from "./egresados-catalogos.js";

// 'YYYY-MM-DD' → 'DD/MM/AAAA' (formato hondureño que la importación acepta).
export function fechaDmy(iso) {
    if (!iso) return "";
    const s = String(iso).slice(0, 10);
    const [y, m, d] = s.split("-");
    return y && m && d ? `${d}/${m}/${y}` : s;
}

function writeSheet(ws, s, headers, widths, rows, refCols, requiredCols) {
    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(requiredCols.has(i) ? s.headerRequired : s.header));
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));
    ws.row(1).freeze();
    rows.forEach((vals, idx) => {
        const isAlt = idx % 2 !== 0;
        const base = isAlt ? s.cellAlt : s.cell;
        const ref = isAlt ? s.refCellAlt : s.refCell;
        vals.forEach((val, col) => writeCell(ws, idx + 2, col + 1, val, refCols.has(col) ? ref : base));
    });
}

function writeInstrucciones(wb, s, lineas) {
    const ws = wb.addWorksheet("Instrucciones");
    ws.column(1).setWidth(110);
    ws.cell(1, 1).string("Cómo llenar esta lista").style(s.catalogHeader);
    lineas.forEach((l, i) => ws.cell(i + 2, 1).string(l).style(s.cell));
}

// ═══════════════════════════════════════════════════════════════════════════
// Lista de cierre
// ═══════════════════════════════════════════════════════════════════════════

export const CIERRE_HEADERS = [
    "ID Matrícula", "DNI", "Nombre completo", "Sexo", "Centro", "Curso", "Código del proceso",
    "Inicio", "Fin", "Resultado*", "Fecha del resultado", "Motivo de deserción", "Observación",
];

export function generateCierreExcel(rows) {
    const wb = new xl.Workbook();
    const s = createStyles(wb);
    const ws = wb.addWorksheet("Cierre");
    const data = rows.map((r) => [
        r.matricula_id, r.identidad, r.nombre, r.sexo === "F" ? "F" : r.sexo === "M" ? "M" : (r.sexo ?? ""),
        r.centro_nombre, r.curso_nombre, r.proceso_codigo,
        fechaDmy(r.fecha_inicial), fechaDmy(r.fecha_final),
        r.resultado ? RESULTADOS[r.resultado] : "",
        fechaDmy(r.fecha_resultado),
        r.motivo_desercion ? MOTIVOS_DESERCION[r.motivo_desercion] : "",
        r.observacion_resultado ?? "",
    ]);
    writeSheet(ws, s, CIERRE_HEADERS, [12, 18, 32, 7, 30, 30, 18, 12, 12, 14, 18, 34, 40],
        data, new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]), new Set([9]));

    addListValidation(ws, 10, `${Object.values(RESULTADOS).join(",")},Pendiente`, Math.max(rows.length + 1, 2));
    addListValidation(ws, 12, Object.values(MOTIVOS_DESERCION).join(","), Math.max(rows.length + 1, 2));

    writeInstrucciones(wb, s, [
        "1. Las columnas grises identifican la matrícula: no las modifique.",
        "2. Resultado: Egresó, Desertó o Pendiente (Pendiente quita un resultado registrado por error). Vacío = sin cambios.",
        "3. Fecha del resultado (DD/MM/AAAA): si un egreso la deja vacía se usa la fecha de fin del curso. Para Desertó es obligatoria.",
        "4. Motivo de deserción: obligatorio cuando el resultado es Desertó.",
        "5. Los desertores se marcan aquí; no los quite de la matrícula, así cuentan en el % de retención.",
    ]);
    return wb;
}

export function parseCierreExcel(buffer) {
    return readFirstSheet(buffer).map((row, idx) => ({
        _row: idx + 2,
        matricula_id: Number.isInteger(Number(row["ID Matrícula"])) && String(row["ID Matrícula"]).trim() !== ""
            ? Number(row["ID Matrícula"]) : null,
        identidad: row["DNI"],
        proceso_codigo: row["Código del proceso"],
        resultado: row["Resultado"],
        fecha: row["Fecha del resultado"],
        motivo: row["Motivo de deserción"],
        observacion: row["Observación"],
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Plantilla de seguimiento
// ═══════════════════════════════════════════════════════════════════════════

export const SEGUIMIENTO_HEADERS = [
    // Identificación (gris)
    "ID Matrícula", "Cohorte", "Centro", "Curso", "Código del proceso", "Nombre completo", "DNI", "Sexo",
    "Último corte", "Último estatus",
    // Corte actual
    "Estatus*", "Empresa", "Puesto", "Rango de salario", "Negocio", "Rubro", "Rango de ingreso",
    "Kit (Sí/No)", "Monto del kit", "Qué estudia", "Centro educativo", "Fecha de inicio", "Observaciones",
    // Pasantía (se conserva entre cortes)
    "Pasantía: empresa", "Pasantía: inicio", "Pasantía: fin", "Pasantía: resultado",
    "Pasantía: motivo de deserción", "Pasantía: % de avance", "Pasantía: beneficio", "Pasantía: otorgado por",
];

const SEG_WIDTHS = [
    12, 9, 28, 28, 16, 30, 17, 6, 12, 20,
    20, 26, 20, 20, 24, 20, 20, 10, 12, 24, 26, 14, 36,
    26, 12, 12, 16, 30, 12, 24, 22,
];

export function generateSeguimientoExcel(rows) {
    const wb = new xl.Workbook();
    const s = createStyles(wb);
    const ws = wb.addWorksheet("Seguimiento");
    const u = (r) => r.ultimo ?? {};
    const p = (r) => r.pasantia ?? {};
    const data = rows.map((r) => [
        r.matricula_id, r.anio ?? "", r.centro_nombre, r.curso_nombre, r.proceso_codigo, r.nombre, r.identidad,
        r.sexo ?? "",
        fechaDmy(u(r).fecha_corte), u(r).estatus ? ESTATUS_SEGUIMIENTO[u(r).estatus] : "Sin seguimiento",
        // El corte nuevo arranca con el último estatus: solo se cambia lo que cambió.
        u(r).estatus ? ESTATUS_SEGUIMIENTO[u(r).estatus] : "",
        u(r).empresa ?? "", u(r).puesto ?? "", u(r).rango_salario ?? "", u(r).negocio ?? "", u(r).rubro ?? "",
        u(r).rango_ingreso ?? "",
        u(r).kit_entregado === true ? "Sí" : u(r).kit_entregado === false ? "No" : "",
        u(r).kit_monto_cents != null ? Number(u(r).kit_monto_cents) / 100 : "",
        u(r).carrera ?? "", u(r).institucion ?? "", fechaDmy(u(r).fecha_inicio), u(r).observaciones ?? "",
        p(r).empresa ?? "", fechaDmy(p(r).fecha_inicio), fechaDmy(p(r).fecha_fin),
        p(r).resultado ? RESULTADOS_PASANTIA[p(r).resultado] : "",
        p(r).motivo_desercion ? MOTIVOS_DESERCION[p(r).motivo_desercion] : "",
        p(r).porcentaje_avance ?? "", p(r).beneficio ?? "", p(r).beneficio_otorgado_por ?? "",
    ]);
    writeSheet(ws, s, SEGUIMIENTO_HEADERS, SEG_WIDTHS, data, new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), new Set([10]));

    const maxRow = Math.max(rows.length + 1, 2);
    const col = (h) => SEGUIMIENTO_HEADERS.indexOf(h) + 1;
    addListValidation(ws, col("Estatus*"), Object.values(ESTATUS_SEGUIMIENTO).join(","), maxRow);
    addListValidation(ws, col("Rango de salario"), `=Listas!$A$2:$A$${RANGOS_INGRESO.length + 1}`, maxRow);
    addListValidation(ws, col("Rango de ingreso"), `=Listas!$A$2:$A$${RANGOS_INGRESO.length + 1}`, maxRow);
    addListValidation(ws, col("Kit (Sí/No)"), "Sí,No", maxRow);
    addListValidation(ws, col("Pasantía: resultado"), Object.values(RESULTADOS_PASANTIA).join(","), maxRow);
    addListValidation(ws, col("Pasantía: motivo de deserción"), Object.values(MOTIVOS_DESERCION).join(","), maxRow);

    writeCatalogSheet(wb, s, "Listas", ["Rangos de salario / ingreso"], RANGOS_INGRESO.map((r) => [r]), [28]);
    writeInstrucciones(wb, s, [
        "1. Cada archivo es un corte: al subirlo se indica la fecha de corte en el sistema.",
        "2. La columna Estatus ya trae el último estatus registrado: cambie solo lo que cambió. Deje Estatus vacío para no registrar a ese joven en este corte.",
        "3. Estatus: Trabajo permanente, Trabajo temporal, Emprendiendo, Estudiando, Búsqueda de empleo, En pasantía, Otro o No aplica.",
        "4. Llene el detalle que corresponda: Empresa, Puesto y Rango de salario si trabaja; Negocio, Rubro, Rango de ingreso y Kit si emprende; Qué estudia y Centro educativo si estudia.",
        "5. Las columnas de Pasantía se guardan aparte y no cambian entre cortes; déjelas como están si no hay novedades.",
        "6. Subir otra vez el mismo archivo con la misma fecha de corte actualiza los datos, no los duplica.",
    ]);
    return wb;
}

export function parseSeguimientoExcel(buffer) {
    return readFirstSheet(buffer).map((row, idx) => ({
        _row: idx + 2,
        matricula_id: Number.isInteger(Number(row["ID Matrícula"])) && String(row["ID Matrícula"]).trim() !== ""
            ? Number(row["ID Matrícula"]) : null,
        identidad: row["DNI"],
        proceso_codigo: row["Código del proceso"],
        estatus: row["Estatus"],
        empresa: row["Empresa"],
        puesto: row["Puesto"],
        rango_salario: row["Rango de salario"],
        negocio: row["Negocio"],
        rubro: row["Rubro"],
        rango_ingreso: row["Rango de ingreso"],
        kit_entregado: row["Kit (Sí/No)"],
        kit_monto: row["Monto del kit"],
        carrera: row["Qué estudia"],
        institucion: row["Centro educativo"],
        fecha_inicio: row["Fecha de inicio"],
        observaciones: row["Observaciones"],
        pasantia: {
            empresa: row["Pasantía: empresa"],
            fecha_inicio: row["Pasantía: inicio"],
            fecha_fin: row["Pasantía: fin"],
            resultado: row["Pasantía: resultado"],
            motivo_desercion: row["Pasantía: motivo de deserción"],
            porcentaje_avance: row["Pasantía: % de avance"],
            beneficio: row["Pasantía: beneficio"],
            beneficio_otorgado_por: row["Pasantía: otorgado por"],
        },
    }));
}
