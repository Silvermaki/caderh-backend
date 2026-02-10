import xl from "excel4node";
import XLSX from "xlsx";

// ─── Helpers ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DONATION_TYPE_MAP = {
    EFECTIVO: "CASH",
    SUMINISTROS: "SUPPLY",
    CASH: "CASH",
    SUPPLY: "SUPPLY",
};

const DONATION_TYPE_DISPLAY = {
    CASH: "EFECTIVO",
    SUPPLY: "SUMINISTROS",
};

function headerStyle(wb) {
    return wb.createStyle({
        font: { bold: true, size: 11 },
        fill: { type: "pattern", patternType: "solid", fgColor: "E2EFDA" },
        border: {
            bottom: { style: "thin", color: "000000" },
        },
    });
}

// ─── GENERATE: Financing Sources ────────────────────────────────────────────

export function generateFinancingSourcesExcel(rows, allSources) {
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet("Fuentes de Financiamiento");
    const hStyle = headerStyle(wb);

    const headers = ["id", "financing_source_id", "fuente_nombre", "monto", "descripcion"];
    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(hStyle));

    // Column widths
    ws.column(1).setWidth(38);
    ws.column(2).setWidth(38);
    ws.column(3).setWidth(30);
    ws.column(4).setWidth(18);
    ws.column(5).setWidth(30);

    const sourceMap = Object.fromEntries((allSources ?? []).map((s) => [s.id, s.name]));

    rows.forEach((r, idx) => {
        const row = idx + 2;
        ws.cell(row, 1).string(r.id ?? "");
        ws.cell(row, 2).string(r.financing_source_id ?? "");
        ws.cell(row, 3).string(sourceMap[r.financing_source_id] ?? "");
        ws.cell(row, 4).number(Number(r.amount ?? 0) / 100);
        ws.cell(row, 5).string(r.description ?? "");
    });

    // Auxiliary sheet: available sources
    if (allSources && allSources.length > 0) {
        const ws2 = wb.addWorksheet("Fuentes Disponibles");
        const headers2 = ["financing_source_id", "nombre"];
        headers2.forEach((h, i) => ws2.cell(1, i + 1).string(h).style(hStyle));
        ws2.column(1).setWidth(38);
        ws2.column(2).setWidth(30);
        allSources.forEach((s, idx) => {
            ws2.cell(idx + 2, 1).string(s.id);
            ws2.cell(idx + 2, 2).string(s.name);
        });
    }

    return wb;
}

// ─── GENERATE: Donations ────────────────────────────────────────────────────

export function generateDonationsExcel(rows) {
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet("Donaciones");
    const hStyle = headerStyle(wb);

    const headers = ["id", "monto", "descripcion", "tipo"];
    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(hStyle));

    ws.column(1).setWidth(38);
    ws.column(2).setWidth(18);
    ws.column(3).setWidth(30);
    ws.column(4).setWidth(18);

    rows.forEach((r, idx) => {
        const row = idx + 2;
        ws.cell(row, 1).string(r.id ?? "");
        ws.cell(row, 2).number(Number(r.amount ?? 0) / 100);
        ws.cell(row, 3).string(r.description ?? "");
        ws.cell(row, 4).string(DONATION_TYPE_DISPLAY[r.donation_type] ?? "EFECTIVO");
    });

    return wb;
}

// ─── GENERATE: Expenses ─────────────────────────────────────────────────────

export function generateExpensesExcel(rows) {
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet("Gastos");
    const hStyle = headerStyle(wb);

    const headers = ["id", "monto", "descripcion"];
    headers.forEach((h, i) => ws.cell(1, i + 1).string(h).style(hStyle));

    ws.column(1).setWidth(38);
    ws.column(2).setWidth(18);
    ws.column(3).setWidth(30);

    rows.forEach((r, idx) => {
        const row = idx + 2;
        ws.cell(row, 1).string(r.id ?? "");
        ws.cell(row, 2).number(Number(r.amount ?? 0) / 100);
        ws.cell(row, 3).string(r.description ?? "");
    });

    return wb;
}

// ─── PARSE: Financing Sources ───────────────────────────────────────────────

export function parseFinancingSourcesExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2; // 1-indexed, skip header
        const id = String(row.id ?? "").trim();
        const financing_source_id = String(row.financing_source_id ?? "").trim();
        const monto = Number(row.monto);
        const description = String(row.descripcion ?? "").trim();

        if (!financing_source_id) {
            errors.push({ row: rowNum, message: "financing_source_id es requerido" });
            return;
        }
        if (!UUID_RE.test(financing_source_id)) {
            errors.push({ row: rowNum, message: "financing_source_id no es un UUID válido" });
            return;
        }
        if (isNaN(monto)) {
            errors.push({ row: rowNum, message: "monto inválido" });
            return;
        }
        if (id && !UUID_RE.test(id)) {
            errors.push({ row: rowNum, message: "id no es un UUID válido" });
            return;
        }

        parsed.push({
            id: id || null,
            financing_source_id,
            amount: Math.round(monto * 100),
            description,
        });
    });

    return { parsed, errors };
}

// ─── PARSE: Donations ───────────────────────────────────────────────────────

export function parseDonationsExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const id = String(row.id ?? "").trim();
        const monto = Number(row.monto);
        const description = String(row.descripcion ?? "").trim();
        const tipoRaw = String(row.tipo ?? "").trim().toUpperCase();
        const donation_type = DONATION_TYPE_MAP[tipoRaw];

        if (isNaN(monto)) {
            errors.push({ row: rowNum, message: "monto inválido" });
            return;
        }
        if (!donation_type) {
            errors.push({ row: rowNum, message: `tipo inválido: "${row.tipo}". Use EFECTIVO o SUMINISTROS` });
            return;
        }
        if (id && !UUID_RE.test(id)) {
            errors.push({ row: rowNum, message: "id no es un UUID válido" });
            return;
        }

        parsed.push({
            id: id || null,
            amount: Math.round(monto * 100),
            description,
            donation_type,
        });
    });

    return { parsed, errors };
}

// ─── PARSE: Expenses ────────────────────────────────────────────────────────

export function parseExpensesExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const parsed = [];
    const errors = [];

    jsonRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const id = String(row.id ?? "").trim();
        const monto = Number(row.monto);
        const description = String(row.descripcion ?? "").trim();

        if (isNaN(monto)) {
            errors.push({ row: rowNum, message: "monto inválido" });
            return;
        }
        if (id && !UUID_RE.test(id)) {
            errors.push({ row: rowNum, message: "id no es un UUID válido" });
            return;
        }

        parsed.push({
            id: id || null,
            amount: Math.round(monto * 100),
            description,
        });
    });

    return { parsed, errors };
}
