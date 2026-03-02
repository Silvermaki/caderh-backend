import xl from "excel4node";
import XLSX from "xlsx";

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(wb) {
    return {
        header: wb.createStyle({
            font: { bold: true, size: 11, color: "FFFFFF" },
            fill: { type: "pattern", patternType: "solid", fgColor: "1F4E79" },
            border: { bottom: { style: "thin", color: "000000" }, top: { style: "thin", color: "000000" }, left: { style: "thin", color: "000000" }, right: { style: "thin", color: "000000" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
        }),
        catalogHeader: wb.createStyle({
            font: { bold: true, size: 11, color: "FFFFFF" },
            fill: { type: "pattern", patternType: "solid", fgColor: "375623" },
            border: { bottom: { style: "thin", color: "000000" }, top: { style: "thin", color: "000000" }, left: { style: "thin", color: "000000" }, right: { style: "thin", color: "000000" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
        }),
        cell: wb.createStyle({
            border: { bottom: { style: "thin", color: "D9D9D9" }, top: { style: "thin", color: "D9D9D9" }, left: { style: "thin", color: "D9D9D9" }, right: { style: "thin", color: "D9D9D9" } },
            font: { size: 10 },
        }),
        cellAlt: wb.createStyle({
            fill: { type: "pattern", patternType: "solid", fgColor: "F2F2F2" },
            border: { bottom: { style: "thin", color: "D9D9D9" }, top: { style: "thin", color: "D9D9D9" }, left: { style: "thin", color: "D9D9D9" }, right: { style: "thin", color: "D9D9D9" } },
            font: { size: 10 },
        }),
        refCell: wb.createStyle({
            fill: { type: "pattern", patternType: "solid", fgColor: "E2E2E2" },
            font: { size: 10, italics: true, color: "666666" },
            border: { bottom: { style: "thin", color: "D9D9D9" }, top: { style: "thin", color: "D9D9D9" }, left: { style: "thin", color: "D9D9D9" }, right: { style: "thin", color: "D9D9D9" } },
        }),
        refCellAlt: wb.createStyle({
            fill: { type: "pattern", patternType: "solid", fgColor: "D6D6D6" },
            font: { size: 10, italics: true, color: "666666" },
            border: { bottom: { style: "thin", color: "D9D9D9" }, top: { style: "thin", color: "D9D9D9" }, left: { style: "thin", color: "D9D9D9" }, right: { style: "thin", color: "D9D9D9" } },
        }),
        protectedYes: wb.createStyle({
            fill: { type: "pattern", patternType: "solid", fgColor: "FFF2CC" },
            font: { size: 10, bold: true, color: "CC0000" },
            border: { bottom: { style: "thin", color: "D9D9D9" }, top: { style: "thin", color: "D9D9D9" }, left: { style: "thin", color: "D9D9D9" }, right: { style: "thin", color: "D9D9D9" } },
            alignment: { horizontal: "center" },
        }),
        protectedNo: wb.createStyle({
            fill: { type: "pattern", patternType: "solid", fgColor: "E2EFDA" },
            font: { size: 10, color: "375623" },
            border: { bottom: { style: "thin", color: "D9D9D9" }, top: { style: "thin", color: "D9D9D9" }, left: { style: "thin", color: "D9D9D9" }, right: { style: "thin", color: "D9D9D9" } },
            alignment: { horizontal: "center" },
        }),
    };
}

function writeCell(ws, row, col, value, style) {
    if (value === null || value === undefined) {
        ws.cell(row, col).string("").style(style);
    } else if (typeof value === "number") {
        ws.cell(row, col).number(value).style(style);
    } else {
        ws.cell(row, col).string(String(value)).style(style);
    }
}

function writeCatalogSheet(wb, styles, name, headers, rows, widths) {
    const ws = wb.addWorksheet(name);
    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(styles.catalogHeader));
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));
    ws.row(1).freeze();
    rows.forEach((r, idx) => {
        const rowStyle = idx % 2 === 0 ? styles.cell : styles.cellAlt;
        r.forEach((val, col) => writeCell(ws, idx + 2, col + 1, val, rowStyle));
    });
}

// ─── Hardcoded catalogs ─────────────────────────────────────────────────────

const SEXO_OPTIONS = [
    { value: "M", label: "Masculino" },
    { value: "F", label: "Femenino" },
];

const ESTADO_CIVIL_OPTIONS = [
    { value: "Soltero(a)", label: "Soltero(a)" },
    { value: "Casado(a)", label: "Casado(a)" },
    { value: "Divorciado(a)", label: "Divorciado(a)" },
    { value: "Viudo(a)", label: "Viudo(a)" },
    { value: "Union Libre", label: "Unión Libre" },
];

const VIVE_OPTIONS = ["Padres", "Solo(a)", "Pareja", "Familiares", "Otros"];

const SI_NO_OPTIONS = [
    { value: 0, label: "No" },
    { value: 1, label: "Si" },
];

const SEDE_OPTIONS = [
    { value: 0, label: "En el Centro" },
    { value: 1, label: "Fuera del Centro" },
];

const DIAS_OPTIONS = [
    { value: "1", label: "Domingo" },
    { value: "2", label: "Lunes" },
    { value: "3", label: "Martes" },
    { value: "4", label: "Miércoles" },
    { value: "5", label: "Jueves" },
    { value: "6", label: "Viernes" },
    { value: "7", label: "Sábado" },
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE: Instructores
// ═══════════════════════════════════════════════════════════════════════════

export function generateInstructorsExcel(rows, catalogs, protectedIds) {
    const protSet = new Set(protectedIds ?? []);
    const wb = new xl.Workbook();
    const s = createStyles(wb);
    const ws = wb.addWorksheet("Instructores");

    const deptMap = Object.fromEntries((catalogs.departamentos ?? []).map((d) => [d.id, d.nombre]));
    const munMap = Object.fromEntries((catalogs.municipios ?? []).map((m) => [m.id, m.nombre]));
    const neMap = Object.fromEntries((catalogs.nivelEscolaridades ?? []).map((n) => [n.id, n.nombre]));

    const headers = [
        "ID", "Protegido", "Identidad", "Nombres", "Apellidos", "Sexo", "Estado Civil",
        "Fecha Nacimiento", "Departamento ID", "Departamento", "Municipio ID", "Municipio",
        "Direccion", "Email", "Telefono", "Celular",
        "Nivel Escolaridad ID", "Nivel Escolaridad", "Titulo Obtenido", "Otros Titulos",
    ];
    const widths = [10, 12, 18, 22, 22, 10, 16, 16, 16, 22, 14, 22, 30, 25, 16, 16, 18, 22, 25, 25];
    const refCols = new Set([9, 11, 17]); // 0-indexed cols that are reference (Departamento, Municipio, Nivel Escolaridad names)

    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(s.header));
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));
    ws.row(1).freeze();

    rows.forEach((r, idx) => {
        const row = idx + 2;
        const isAlt = idx % 2 !== 0;
        const base = isAlt ? s.cellAlt : s.cell;
        const ref = isAlt ? s.refCellAlt : s.refCell;
        const isProt = protSet.has(r.id);

        const vals = [
            r.id, isProt ? "SI" : "", r.identidad, r.nombres, r.apellidos,
            r.sexo, r.estado_civil, r.fecha_nacimiento || "",
            r.departamento_id, deptMap[r.departamento_id] ?? "", r.municipio_id, munMap[r.municipio_id] ?? "",
            r.direccion || "", r.email || "", r.telefono || "", r.celular || "",
            r.nivel_escolaridad_id ?? "", neMap[r.nivel_escolaridad_id] ?? "",
            r.titulo_obtenido || "", r.otros_titulos || "",
        ];

        vals.forEach((val, col) => {
            if (col === 1) {
                writeCell(ws, row, col + 1, val, isProt ? s.protectedYes : s.protectedNo);
            } else if (refCols.has(col)) {
                writeCell(ws, row, col + 1, val, ref);
            } else {
                writeCell(ws, row, col + 1, val, base);
            }
        });
    });

    // Catalog sheets
    writeCatalogSheet(wb, s, "Departamentos", ["ID", "Nombre"], (catalogs.departamentos ?? []).map((d) => [d.id, d.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Municipios", ["ID", "Nombre", "Departamento ID"], (catalogs.municipios ?? []).map((m) => [m.id, m.nombre, m.departamento_id]), [10, 30, 16]);
    writeCatalogSheet(wb, s, "Niveles Escolaridad", ["ID", "Nombre"], (catalogs.nivelEscolaridades ?? []).map((n) => [n.id, n.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Catalogo Sexo", ["Valor", "Descripcion"], SEXO_OPTIONS.map((o) => [o.value, o.label]), [10, 20]);
    writeCatalogSheet(wb, s, "Catalogo Estado Civil", ["Valor"], ESTADO_CIVIL_OPTIONS.map((o) => [o.value]), [20]);

    return wb;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE: Estudiantes
// ═══════════════════════════════════════════════════════════════════════════

export function generateStudentsExcel(rows, catalogs, protectedIds) {
    const protSet = new Set(protectedIds ?? []);
    const wb = new xl.Workbook();
    const s = createStyles(wb);
    const ws = wb.addWorksheet("Estudiantes");

    const deptMap = Object.fromEntries((catalogs.departamentos ?? []).map((d) => [d.id, d.nombre]));
    const munMap = Object.fromEntries((catalogs.municipios ?? []).map((m) => [m.id, m.nombre]));
    const neMap = Object.fromEntries((catalogs.nivelEscolaridades ?? []).map((n) => [n.id, n.nombre]));

    const headers = [
        "ID", "Protegido", "Identidad", "Nombres", "Apellidos", "Sexo", "Estado Civil",
        "Fecha Nacimiento", "Tipo Sangre",
        "Departamento ID", "Departamento", "Municipio ID", "Municipio", "Direccion",
        "Email", "Telefono", "Celular", "Facebook", "Instagram", "Twitter",
        "Estudia", "Nivel Escolaridad ID", "Nivel Escolaridad",
        "Vive", "Num. Dependientes",
        "Tiene Hijos", "Cuantos Hijos", "Vivienda", "Cant. Viven", "Cant. Trabajan", "Cant. No Trabajan", "Ingreso Promedio",
        "Trabajo Actual", "Donde Trabaja", "Puesto",
        "Trabajado Ant.", "Tiempo Ant.", "Tipo Contrato Ant.",
        "Beneficios Empleo", "Beneficios Empleo Otro",
        "Autoempleo", "Autoempleo Dedicacion", "Autoempleo Otro", "Autoempleo Tiempo",
        "Dias Semana Trabajo", "Horas Dia Trabajo", "Socios", "Socios Cantidad",
        "Especial", "Discapacidad ID", "Riesgo Social", "Etnia ID", "Interno",
        "Nombre Ref.", "Telefono Ref.", "Datos Ref.", "Parentesco Ref.", "Adicional Ref.",
    ];
    const widths = [
        10, 12, 18, 22, 22, 10, 16, 16, 14,
        16, 22, 14, 22, 30,
        25, 16, 16, 20, 20, 20,
        10, 18, 22,
        14, 16,
        12, 14, 14, 12, 14, 16, 16,
        14, 20, 20,
        14, 14, 16,
        20, 20,
        12, 20, 20, 16,
        18, 16, 10, 14,
        10, 16, 14, 10, 10,
        22, 16, 20, 16, 20,
    ];
    const refCols = new Set([10, 12, 22]); // Departamento name, Municipio name, Nivel Escolaridad name

    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(s.header));
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));
    ws.row(1).freeze();

    rows.forEach((r, idx) => {
        const row = idx + 2;
        const isAlt = idx % 2 !== 0;
        const base = isAlt ? s.cellAlt : s.cell;
        const ref = isAlt ? s.refCellAlt : s.refCell;
        const isProt = protSet.has(r.id);

        const vals = [
            r.id, isProt ? "SI" : "", r.identidad, r.nombres, r.apellidos,
            r.sexo, r.estado_civil, r.fecha_nacimiento || "", r.sangre || "",
            r.departamento_id, deptMap[r.departamento_id] ?? "", r.municipio_id, munMap[r.municipio_id] ?? "",
            r.direccion || "",
            r.email || "", r.telefono || "", r.celular || "",
            r.facebook || "", r.instagram || "", r.twitter || "",
            r.estudia ?? 0, r.nivel_escolaridad_id ?? "", neMap[r.nivel_escolaridad_id] ?? "",
            r.vive || "", r.numero_dep || "",
            r.tiene_hijos ?? 0, r.cuantos_hijos ?? 0, r.vivienda || "",
            r.cantidad_viven ?? 0, r.cantidad_trabajan_viven ?? 0, r.cantidad_notrabajan_viven ?? 0, r.ingreso_promedio ?? 0,
            r.trabajo_actual ?? 0, r.donde_trabaja || "", r.puesto || "",
            r.trabajado_ant ?? 0, r.tiempo_ant || "", r.tipo_contrato_ant ?? "",
            r.beneficios_empleo || "", r.beneficios_empleo_otro || "",
            r.autoempleo ?? 0, r.autoempleo_dedicacion || "", r.autoempleo_otro || "", r.autoempleo_tiempo || "",
            r.dias_semana_trabajo || "", r.horas_dia_trabajo || "", r.socios ?? 0, r.socios_cantidad ?? 0,
            r.especial ?? 0, r.discapacidad_id || "", r.riesgo_social ?? 0, r.etnia_id || "", r.interno ?? 0,
            r.nombre_r || "", r.telefono_r || "", r.datos_r || "", r.parentesco_r || "", r.adicional_r || "",
        ];

        vals.forEach((val, col) => {
            if (col === 1) {
                writeCell(ws, row, col + 1, val, isProt ? s.protectedYes : s.protectedNo);
            } else if (refCols.has(col)) {
                writeCell(ws, row, col + 1, val, ref);
            } else {
                writeCell(ws, row, col + 1, val, base);
            }
        });
    });

    // Catalog sheets
    writeCatalogSheet(wb, s, "Departamentos", ["ID", "Nombre"], (catalogs.departamentos ?? []).map((d) => [d.id, d.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Municipios", ["ID", "Nombre", "Departamento ID"], (catalogs.municipios ?? []).map((m) => [m.id, m.nombre, m.departamento_id]), [10, 30, 16]);
    writeCatalogSheet(wb, s, "Niveles Escolaridad", ["ID", "Nombre"], (catalogs.nivelEscolaridades ?? []).map((n) => [n.id, n.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Catalogo Sexo", ["Valor", "Descripcion"], SEXO_OPTIONS.map((o) => [o.value, o.label]), [10, 20]);
    writeCatalogSheet(wb, s, "Catalogo Estado Civil", ["Valor"], ESTADO_CIVIL_OPTIONS.map((o) => [o.value]), [20]);
    writeCatalogSheet(wb, s, "Catalogo Vive", ["Valor"], VIVE_OPTIONS.map((v) => [v]), [20]);
    writeCatalogSheet(wb, s, "Catalogo Si-No", ["Valor", "Descripcion"], SI_NO_OPTIONS.map((o) => [o.value, o.label]), [10, 16]);

    return wb;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE: Cursos
// ═══════════════════════════════════════════════════════════════════════════

export function generateCoursesExcel(rows, catalogs, protectedIds) {
    const protSet = new Set(protectedIds ?? []);
    const wb = new xl.Workbook();
    const s = createStyles(wb);
    const ws = wb.addWorksheet("Cursos");

    const deptMap = Object.fromEntries((catalogs.departamentos ?? []).map((d) => [d.id, d.nombre]));
    const munMap = Object.fromEntries((catalogs.municipios ?? []).map((m) => [m.id, m.nombre]));

    const headers = [
        "ID", "Protegido", "Codigo", "Nombre", "Codigo Programa", "Taller",
        "Total Horas", "Objetivo",
        "Departamento ID", "Departamento", "Municipio ID", "Municipio", "Comunidad",
    ];
    const widths = [10, 12, 12, 30, 18, 10, 14, 40, 16, 22, 14, 22, 22];
    const refCols = new Set([6, 9, 11]); // Total Horas (readonly), Departamento name, Municipio name

    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(s.header));
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));
    ws.row(1).freeze();

    rows.forEach((r, idx) => {
        const row = idx + 2;
        const isAlt = idx % 2 !== 0;
        const base = isAlt ? s.cellAlt : s.cell;
        const ref = isAlt ? s.refCellAlt : s.refCell;
        const isProt = protSet.has(r.id);

        const vals = [
            r.id, isProt ? "SI" : "", r.codigo, r.nombre, r.codigo_programa,
            r.taller ?? 1, r.total_horas || "", r.objetivo || "",
            r.departamento_id ?? "", deptMap[r.departamento_id] ?? "",
            r.municipio_id ?? "", munMap[r.municipio_id] ?? "",
            r.comunidad || "",
        ];

        vals.forEach((val, col) => {
            if (col === 1) {
                writeCell(ws, row, col + 1, val, isProt ? s.protectedYes : s.protectedNo);
            } else if (refCols.has(col)) {
                writeCell(ws, row, col + 1, val, ref);
            } else {
                writeCell(ws, row, col + 1, val, base);
            }
        });
    });

    writeCatalogSheet(wb, s, "Departamentos", ["ID", "Nombre"], (catalogs.departamentos ?? []).map((d) => [d.id, d.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Municipios", ["ID", "Nombre", "Departamento ID"], (catalogs.municipios ?? []).map((m) => [m.id, m.nombre, m.departamento_id]), [10, 30, 16]);
    writeCatalogSheet(wb, s, "Catalogo Taller", ["Valor", "Descripcion"], [[0, "No"], [1, "Si"]], [10, 16]);

    return wb;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE: Procesos Educativos
// ═══════════════════════════════════════════════════════════════════════════

export function generateProcessesExcel(rows, catalogs, protectedIds) {
    const protSet = new Set(protectedIds ?? []);
    const wb = new xl.Workbook();
    const s = createStyles(wb);
    const ws = wb.addWorksheet("Procesos");

    const instMap = Object.fromEntries((catalogs.instructores ?? []).map((i) => [i.id, `${i.nombres} ${i.apellidos}`]));
    const cursoMap = Object.fromEntries((catalogs.cursos ?? []).map((c) => [c.id, c.nombre]));
    const metMap = Object.fromEntries((catalogs.metodologias ?? []).map((m) => [m.id, m.nombre]));
    const tjMap = Object.fromEntries((catalogs.tipoJornadas ?? []).map((t) => [t.id, t.nombre]));

    const headers = [
        "ID", "Protegido", "Codigo", "Nombre",
        "Instructor ID", "Instructor", "Curso ID", "Curso",
        "Metodologia ID", "Metodologia", "Otra Metodologia",
        "Fecha Inicial", "Fecha Final", "Duracion Horas",
        "Tipo Jornada ID", "Tipo Jornada",
        "Horario", "Dias", "Sede", "Lugar",
    ];
    const widths = [10, 12, 14, 30, 14, 30, 12, 30, 16, 22, 22, 14, 14, 14, 16, 22, 20, 20, 12, 25];
    const refCols = new Set([5, 7, 9, 15]); // Instructor name, Curso name, Metodologia name, Tipo Jornada name

    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(s.header));
    widths.forEach((w, i) => ws.column(i + 1).setWidth(w));
    ws.row(1).freeze();

    rows.forEach((r, idx) => {
        const row = idx + 2;
        const isAlt = idx % 2 !== 0;
        const base = isAlt ? s.cellAlt : s.cell;
        const ref = isAlt ? s.refCellAlt : s.refCell;
        const isProt = protSet.has(r.id);

        const vals = [
            r.id, isProt ? "SI" : "", r.codigo, r.nombre,
            r.instructor_id, instMap[r.instructor_id] ?? "", r.curso_id, cursoMap[r.curso_id] ?? "",
            r.metodologia_id, metMap[r.metodologia_id] ?? "", r.otra_metodologia || "",
            r.fecha_inicial || "", r.fecha_final || "", r.duracion_horas || "",
            r.tipo_jornada_id, tjMap[r.tipo_jornada_id] ?? "",
            r.horario || "", r.dias || "", r.sede ?? 0, r.lugar || "",
        ];

        vals.forEach((val, col) => {
            if (col === 1) {
                writeCell(ws, row, col + 1, val, isProt ? s.protectedYes : s.protectedNo);
            } else if (refCols.has(col)) {
                writeCell(ws, row, col + 1, val, ref);
            } else {
                writeCell(ws, row, col + 1, val, base);
            }
        });
    });

    writeCatalogSheet(wb, s, "Instructores", ["ID", "Nombre Completo"],
        (catalogs.instructores ?? []).map((i) => [i.id, `${i.nombres} ${i.apellidos}`]), [10, 40]);
    writeCatalogSheet(wb, s, "Cursos", ["ID", "Nombre"],
        (catalogs.cursos ?? []).map((c) => [c.id, c.nombre]), [10, 40]);
    writeCatalogSheet(wb, s, "Metodologias", ["ID", "Nombre"],
        (catalogs.metodologias ?? []).map((m) => [m.id, m.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Tipo Jornadas", ["ID", "Nombre"],
        (catalogs.tipoJornadas ?? []).map((t) => [t.id, t.nombre]), [10, 30]);
    writeCatalogSheet(wb, s, "Catalogo Sede", ["Valor", "Descripcion"], SEDE_OPTIONS.map((o) => [o.value, o.label]), [10, 22]);
    writeCatalogSheet(wb, s, "Catalogo Dias", ["Valor", "Dia"], DIAS_OPTIONS.map((d) => [d.value, d.label]), [10, 16]);

    return wb;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSE helpers
// ═══════════════════════════════════════════════════════════════════════════

function readFirstSheet(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function intOrNull(val) {
    if (val === "" || val === null || val === undefined) return null;
    const n = Number(val);
    return Number.isInteger(n) ? n : null;
}

function intOrZero(val) {
    const n = intOrNull(val);
    return n ?? 0;
}

function strOrNull(val) {
    const s = String(val ?? "").trim();
    return s || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSE: Instructores
// ═══════════════════════════════════════════════════════════════════════════

export function parseInstructorsExcel(buffer) {
    const jsonRows = readFirstSheet(buffer);
    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const id = intOrNull(row["ID"]);
        const identidad = strOrNull(row["Identidad"]);
        const nombres = strOrNull(row["Nombres"]);
        const apellidos = strOrNull(row["Apellidos"]);
        const sexo = strOrNull(row["Sexo"]);
        const estado_civil = strOrNull(row["Estado Civil"]);
        const fecha_nacimiento = strOrNull(row["Fecha Nacimiento"]);
        const departamento_id = intOrNull(row["Departamento ID"]);
        const municipio_id = intOrNull(row["Municipio ID"]);
        const direccion = strOrNull(row["Direccion"]);
        const email = strOrNull(row["Email"]);
        const telefono = strOrNull(row["Telefono"]);
        const celular = strOrNull(row["Celular"]);
        const nivel_escolaridad_id = intOrNull(row["Nivel Escolaridad ID"]);
        const titulo_obtenido = strOrNull(row["Titulo Obtenido"]);
        const otros_titulos = strOrNull(row["Otros Titulos"]);

        if (!nombres) { errors.push({ row: rowNum, message: "Nombres es requerido" }); return; }
        if (!apellidos) { errors.push({ row: rowNum, message: "Apellidos es requerido" }); return; }

        parsed.push({
            id, identidad: identidad || "N/A", nombres, apellidos,
            sexo: sexo || "N/A", estado_civil: estado_civil || "N/A",
            fecha_nacimiento, departamento_id: departamento_id ?? 0, municipio_id: municipio_id ?? 0,
            direccion, email, telefono, celular,
            nivel_escolaridad_id: nivel_escolaridad_id ?? 0, titulo_obtenido, otros_titulos,
        });
    });

    return { parsed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSE: Estudiantes
// ═══════════════════════════════════════════════════════════════════════════

export function parseStudentsExcel(buffer) {
    const jsonRows = readFirstSheet(buffer);
    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const id = intOrNull(row["ID"]);
        const identidad = strOrNull(row["Identidad"]);
        const nombres = strOrNull(row["Nombres"]);
        const apellidos = strOrNull(row["Apellidos"]);
        const sexo = strOrNull(row["Sexo"]);
        const estado_civil = strOrNull(row["Estado Civil"]);

        if (!identidad) { errors.push({ row: rowNum, message: "Identidad es requerido" }); return; }
        if (!nombres) { errors.push({ row: rowNum, message: "Nombres es requerido" }); return; }
        if (!apellidos) { errors.push({ row: rowNum, message: "Apellidos es requerido" }); return; }
        if (!sexo) { errors.push({ row: rowNum, message: "Sexo es requerido" }); return; }
        if (!estado_civil) { errors.push({ row: rowNum, message: "Estado Civil es requerido" }); return; }

        const departamento_id = intOrNull(row["Departamento ID"]);
        const municipio_id = intOrNull(row["Municipio ID"]);
        if (!departamento_id) { errors.push({ row: rowNum, message: "Departamento ID es requerido" }); return; }
        if (!municipio_id) { errors.push({ row: rowNum, message: "Municipio ID es requerido" }); return; }

        const vive = strOrNull(row["Vive"]);
        const numero_dep = strOrNull(row["Num. Dependientes"]);
        if (!vive) { errors.push({ row: rowNum, message: "Vive es requerido" }); return; }
        if (numero_dep === null) { errors.push({ row: rowNum, message: "Num. Dependientes es requerido" }); return; }

        parsed.push({
            id, identidad, nombres, apellidos, sexo, estado_civil,
            fecha_nacimiento: strOrNull(row["Fecha Nacimiento"]),
            sangre: strOrNull(row["Tipo Sangre"]) || "N/A",
            departamento_id, municipio_id,
            direccion: strOrNull(row["Direccion"]),
            email: strOrNull(row["Email"]), telefono: strOrNull(row["Telefono"]), celular: strOrNull(row["Celular"]),
            facebook: strOrNull(row["Facebook"]), instagram: strOrNull(row["Instagram"]), twitter: strOrNull(row["Twitter"]),
            estudia: intOrZero(row["Estudia"]),
            nivel_escolaridad_id: strOrNull(row["Nivel Escolaridad ID"]),
            vive, numero_dep,
            tiene_hijos: intOrZero(row["Tiene Hijos"]), cuantos_hijos: intOrZero(row["Cuantos Hijos"]),
            vivienda: strOrNull(row["Vivienda"]),
            cantidad_viven: intOrZero(row["Cant. Viven"]),
            cantidad_trabajan_viven: intOrZero(row["Cant. Trabajan"]),
            cantidad_notrabajan_viven: intOrZero(row["Cant. No Trabajan"]),
            ingreso_promedio: intOrZero(row["Ingreso Promedio"]),
            trabajo_actual: intOrZero(row["Trabajo Actual"]),
            donde_trabaja: strOrNull(row["Donde Trabaja"]), puesto: strOrNull(row["Puesto"]),
            trabajado_ant: intOrZero(row["Trabajado Ant."]),
            tiempo_ant: strOrNull(row["Tiempo Ant."]),
            tipo_contrato_ant: intOrNull(row["Tipo Contrato Ant."]),
            beneficios_empleo: strOrNull(row["Beneficios Empleo"]),
            beneficios_empleo_otro: strOrNull(row["Beneficios Empleo Otro"]),
            autoempleo: intOrZero(row["Autoempleo"]),
            autoempleo_dedicacion: strOrNull(row["Autoempleo Dedicacion"]),
            autoempleo_otro: strOrNull(row["Autoempleo Otro"]),
            autoempleo_tiempo: strOrNull(row["Autoempleo Tiempo"]),
            dias_semana_trabajo: strOrNull(row["Dias Semana Trabajo"]),
            horas_dia_trabajo: strOrNull(row["Horas Dia Trabajo"]),
            socios: intOrZero(row["Socios"]), socios_cantidad: intOrZero(row["Socios Cantidad"]),
            especial: intOrZero(row["Especial"]),
            discapacidad_id: strOrNull(row["Discapacidad ID"]),
            riesgo_social: intOrZero(row["Riesgo Social"]),
            etnia_id: strOrNull(row["Etnia ID"]),
            interno: intOrZero(row["Interno"]),
            nombre_r: strOrNull(row["Nombre Ref."]), telefono_r: strOrNull(row["Telefono Ref."]),
            datos_r: strOrNull(row["Datos Ref."]), parentesco_r: strOrNull(row["Parentesco Ref."]),
            adicional_r: strOrNull(row["Adicional Ref."]),
        });
    });

    return { parsed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSE: Cursos
// ═══════════════════════════════════════════════════════════════════════════

export function parseCoursesExcel(buffer) {
    const jsonRows = readFirstSheet(buffer);
    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const id = intOrNull(row["ID"]);
        const codigo = row["Codigo"];
        const nombre = strOrNull(row["Nombre"]);
        const codigo_programa = strOrNull(row["Codigo Programa"]);
        const taller = intOrNull(row["Taller"]);
        const objetivo = strOrNull(row["Objetivo"]);

        if (codigo === "" || codigo === null || codigo === undefined) { errors.push({ row: rowNum, message: "Codigo es requerido" }); return; }
        if (!nombre) { errors.push({ row: rowNum, message: "Nombre es requerido" }); return; }
        if (!codigo_programa) { errors.push({ row: rowNum, message: "Codigo Programa es requerido" }); return; }
        if (!objetivo) { errors.push({ row: rowNum, message: "Objetivo es requerido" }); return; }

        parsed.push({
            id,
            codigo: Number.isInteger(Number(codigo)) ? Number(codigo) : codigo,
            nombre, codigo_programa,
            taller: taller ?? 1, objetivo,
            departamento_id: intOrNull(row["Departamento ID"]),
            municipio_id: intOrNull(row["Municipio ID"]),
            comunidad: strOrNull(row["Comunidad"]),
        });
    });

    return { parsed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSE: Procesos Educativos
// ═══════════════════════════════════════════════════════════════════════════

export function parseProcessesExcel(buffer) {
    const jsonRows = readFirstSheet(buffer);
    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const id = intOrNull(row["ID"]);
        const codigo = strOrNull(row["Codigo"]);
        const nombre = strOrNull(row["Nombre"]);
        const instructor_id = intOrNull(row["Instructor ID"]);
        const curso_id = intOrNull(row["Curso ID"]);
        const metodologia_id = intOrNull(row["Metodologia ID"]);
        const fecha_inicial = strOrNull(row["Fecha Inicial"]);
        const fecha_final = strOrNull(row["Fecha Final"]);
        const duracion_horas = strOrNull(row["Duracion Horas"]);
        const tipo_jornada_id = intOrNull(row["Tipo Jornada ID"]);
        const horario = strOrNull(row["Horario"]);
        const dias = strOrNull(row["Dias"]);

        if (!codigo) { errors.push({ row: rowNum, message: "Codigo es requerido" }); return; }
        if (!nombre) { errors.push({ row: rowNum, message: "Nombre es requerido" }); return; }
        if (!instructor_id) { errors.push({ row: rowNum, message: "Instructor ID es requerido" }); return; }
        if (!curso_id) { errors.push({ row: rowNum, message: "Curso ID es requerido" }); return; }
        if (!metodologia_id) { errors.push({ row: rowNum, message: "Metodologia ID es requerido" }); return; }
        if (!fecha_inicial) { errors.push({ row: rowNum, message: "Fecha Inicial es requerido" }); return; }
        if (!fecha_final) { errors.push({ row: rowNum, message: "Fecha Final es requerido" }); return; }
        if (!duracion_horas) { errors.push({ row: rowNum, message: "Duracion Horas es requerido" }); return; }
        if (!tipo_jornada_id) { errors.push({ row: rowNum, message: "Tipo Jornada ID es requerido" }); return; }
        if (!horario) { errors.push({ row: rowNum, message: "Horario es requerido" }); return; }
        if (!dias) { errors.push({ row: rowNum, message: "Dias es requerido" }); return; }

        parsed.push({
            id, codigo, nombre,
            instructor_id, curso_id, metodologia_id,
            otra_metodologia: strOrNull(row["Otra Metodologia"]),
            fecha_inicial, fecha_final, duracion_horas,
            tipo_jornada_id, horario, dias,
            sede: intOrZero(row["Sede"]),
            lugar: strOrNull(row["Lugar"]),
        });
    });

    return { parsed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cross-validation: municipio belongs to departamento
// ═══════════════════════════════════════════════════════════════════════════

export function validateMunicipioDepartamento(parsedRows, municipios, fieldPrefix = "") {
    const munDeptMap = Object.fromEntries(municipios.map((m) => [m.id, m.departamento_id]));
    const warnings = [];

    for (const row of parsedRows) {
        const deptField = fieldPrefix ? `${fieldPrefix}_departamento_id` : "departamento_id";
        const munField = fieldPrefix ? `${fieldPrefix}_municipio_id` : "municipio_id";
        const deptId = row[deptField] ?? row.departamento_id;
        const munId = row[munField] ?? row.municipio_id;

        if (deptId && munId && munDeptMap[munId] !== undefined && munDeptMap[munId] !== deptId) {
            warnings.push({
                id: row.id,
                message: `Municipio ID ${munId} no pertenece al Departamento ID ${deptId}`,
            });
        }
    }

    return warnings;
}
