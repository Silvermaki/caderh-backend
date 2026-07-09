import PdfPrinter from "pdfmake";

// Paleta CADERH (misma configuración de fuentes/estilos que los reportes,
// sin importar nada del módulo de reports).
const CADERH_TEAL_DARK = "#0F7A7A";
const ZEBRA_GREY = "#F7FAFA";
const TEXT_DARK = "#1F2937";
const MUTED = "#6B7280";

// PDFKit incluye las 14 fuentes estándar de PDF (familia Helvetica),
// así que no hace falta empaquetar TTFs.
const fonts = {
    Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
    },
};

const printer = new PdfPrinter(fonts);

/**
 * Genera el PDF del consolidado de centros (tabla landscape).
 *
 * @param {Array<{codigo, siglas, nombre, nombre_director, departamento_nombre,
 *                municipio_nombre, direccion, telefono, email, areas}>} rows
 * @returns {Promise<Buffer>}
 */
export async function generateCentrosConsolidadoPdf(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    const columns = [
        { key: "codigo", label: "Código" },
        { key: "siglas", label: "Siglas" },
        { key: "nombre", label: "Nombre" },
        { key: "nombre_director", label: "Director" },
        { key: "departamento_nombre", label: "Departamento" },
        { key: "municipio_nombre", label: "Municipio" },
        { key: "direccion", label: "Dirección" },
        { key: "telefono", label: "Teléfono" },
        { key: "email", label: "Email" },
        { key: "areas", label: "Áreas que brinda" },
    ];

    const headerRow = columns.map((c) => ({ text: c.label, style: "tableHeader" }));
    const dataRows = safeRows.map((row) =>
        columns.map((c) => ({ text: row?.[c.key] ? String(row[c.key]) : "—", style: "tableCell" }))
    );

    const generatedDate = new Date().toLocaleDateString("es-HN", {
        year: "numeric", month: "long", day: "numeric",
    });

    const content = [
        {
            table: {
                widths: ["*"],
                body: [[{
                    text: "CADERH · Sistema Estadístico ERP",
                    color: "#FFFFFF",
                    bold: true,
                    fontSize: 10,
                    fillColor: CADERH_TEAL_DARK,
                    margin: [8, 6, 8, 6],
                }]],
            },
            layout: "noBorders",
            margin: [0, 0, 0, 6],
        },
        { text: "Consolidado de Centros", style: "title", margin: [0, 0, 0, 2] },
        { text: `Centros activos  ·  Generado: ${generatedDate}`, style: "subtitle", margin: [0, 0, 0, 12] },
    ];

    if (safeRows.length === 0) {
        content.push({ text: "No hay centros activos registrados.", style: "emptyNote", margin: [0, 12, 0, 12] });
    } else {
        content.push({
            table: {
                headerRows: 1,
                widths: [38, 36, "*", 70, 55, 55, "*", 48, 78, "*"],
                body: [headerRow, ...dataRows],
                dontBreakRows: true,
            },
            layout: {
                fillColor: (rowIdx) => {
                    if (rowIdx === 0) return CADERH_TEAL_DARK;
                    return rowIdx % 2 === 0 ? ZEBRA_GREY : null;
                },
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => "#E5E7EB",
                vLineColor: () => "#E5E7EB",
                paddingTop: () => 4,
                paddingBottom: () => 4,
                paddingLeft: () => 6,
                paddingRight: () => 6,
            },
        });
    }

    const docDefinition = {
        pageSize: "A4",
        pageOrientation: "landscape",
        pageMargins: [24, 32, 24, 36],
        footer: (currentPage, pageCount) => ({
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: "center",
            fontSize: 8,
            color: MUTED,
            margin: [0, 12, 0, 0],
        }),
        content,
        defaultStyle: { font: "Helvetica", fontSize: 9, color: TEXT_DARK },
        styles: {
            title: { fontSize: 16, bold: true, color: TEXT_DARK },
            subtitle: { fontSize: 9, italics: true, color: MUTED },
            tableHeader: { color: "#FFFFFF", bold: true, fontSize: 8 },
            tableCell: { fontSize: 7.5, color: TEXT_DARK },
            emptyNote: { fontSize: 10, italics: true, color: MUTED, alignment: "center" },
        },
    };

    return new Promise((resolve, reject) => {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const chunks = [];
        pdfDoc.on("data", (chunk) => chunks.push(chunk));
        pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
        pdfDoc.on("error", reject);
        pdfDoc.end();
    });
}
