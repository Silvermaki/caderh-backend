import PdfPrinter from 'pdfmake';

// CADERH brand palette (matches the XLSX export for visual consistency).
const CADERH_TEAL_DARK = '#0F7A7A';
const CADERH_TEAL_SOFT = '#E6F4F4';
const ZEBRA_GREY       = '#F7FAFA';
const TEXT_DARK        = '#1F2937';
const MUTED            = '#6B7280';
const WARN_AMBER       = '#92400E';
const WARN_AMBER_SOFT  = '#FEF3C7';

// PDFKit ships with the standard 14 PDF fonts built-in (Helvetica family),
// so we don't need to bundle TTF files. pdfmake just needs the font logical
// names declared here.
const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

function formatFilterValue(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') {
    if (v.from && v.to) return `${v.from} → ${v.to}`;
    if (v.min != null && v.max != null) return `${v.min}–${v.max}`;
    return JSON.stringify(v);
  }
  return String(v);
}

function isCurrencyKey(k) {
  return /(presupuesto|monto|desembols|donac|overhead|saldo|ejecutado|ingreso|gasto|kit|estipendio|total)/i.test(k)
    && !/(pct|porcent|count|cantidad|hombres|mujeres|formacion)/i.test(k);
}

function isPercentKey(k) {
  return /(pct|porcent|%)/i.test(k);
}

function formatCellValue(value, columnKey, missingInDb) {
  if (missingInDb) return '—';
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (isCurrencyKey(columnKey)) {
      return `L ${value.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (isPercentKey(columnKey)) {
      return `${value.toFixed(1)}%`;
    }
    return value.toLocaleString('es-HN');
  }
  return String(value);
}

/**
 * Generate a PDF buffer for a report.
 *
 * @param {object} args
 * @param {string} args.title
 * @param {string} [args.subtitle]
 * @param {string} [args.code]
 * @param {Array<{key: string, label: string, align?: 'left'|'right'|'center', missingInDb?: boolean}>} args.columns
 * @param {Array<Record<string, any>>} args.rows
 * @param {Record<string, any>} [args.filtersApplied]
 * @param {string[]} [args.missingColumns]
 * @returns {Promise<Buffer>}
 */
export async function generateReportPdf({
  title,
  subtitle,
  code,
  columns,
  rows,
  filtersApplied = {},
  missingColumns = [],
}) {
  const safeColumns = Array.isArray(columns) && columns.length > 0
    ? columns
    : [{ key: '_empty', label: '(sin columnas)', align: 'left' }];
  const safeRows = Array.isArray(rows) ? rows : [];

  const headerRow = safeColumns.map((c) => ({
    text: c.label || c.key,
    style: 'tableHeader',
    alignment: c.align ?? 'left',
  }));

  const dataRows = safeRows.map((row) =>
    safeColumns.map((c) => ({
      text: formatCellValue(row?.[c.key], c.key, c.missingInDb),
      alignment: c.align ?? 'left',
      style: 'tableCell',
    }))
  );

  const tableBody = [headerRow, ...dataRows];

  const filtersEntries = Object.entries(filtersApplied).filter(
    ([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );

  const generatedDate = new Date().toLocaleDateString('es-HN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const content = [
    // Banner
    {
      table: {
        widths: ['*'],
        body: [[{
          text: 'CADERH · Sistema Estadístico ERP',
          color: '#FFFFFF',
          bold: true,
          fontSize: 10,
          fillColor: CADERH_TEAL_DARK,
          margin: [8, 6, 8, 6],
        }]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 6],
    },
    // Title
    {
      text: code ? `${code} · ${title}` : title,
      style: 'title',
      margin: [0, 0, 0, 2],
    },
    // Subtitle + generated date
    {
      text: `${subtitle ? subtitle + '  ·  ' : ''}Generado: ${generatedDate}`,
      style: 'subtitle',
      margin: [0, 0, 0, 12],
    },
  ];

  if (filtersEntries.length > 0) {
    content.push(
      {
        text: 'Filtros aplicados',
        style: 'sectionHeader',
        fillColor: CADERH_TEAL_SOFT,
        margin: [0, 0, 0, 4],
      },
      {
        ul: filtersEntries.map(([k, v]) => `${k}: ${formatFilterValue(v)}`),
        style: 'filterItem',
        margin: [10, 0, 0, 12],
      }
    );
  }

  if (safeRows.length === 0) {
    content.push({
      text: 'No hay datos para los filtros seleccionados.',
      style: 'emptyNote',
      margin: [0, 12, 0, 12],
    });
  } else {
    content.push({
      table: {
        headerRows: 1,
        widths: safeColumns.map(() => '*'),
        body: tableBody,
        dontBreakRows: true,
      },
      layout: {
        fillColor: (rowIdx) => {
          if (rowIdx === 0) return CADERH_TEAL_DARK;
          return rowIdx % 2 === 0 ? ZEBRA_GREY : null;
        },
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#E5E7EB',
        vLineColor: () => '#E5E7EB',
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 6,
        paddingRight: () => 6,
      },
    });
  }

  if (missingColumns.length > 0) {
    content.push(
      {
        text: `Nota: ${missingColumns.length} columna(s) pendiente(s) de captura en el sistema`,
        style: 'missingHeader',
        fillColor: WARN_AMBER_SOFT,
        margin: [0, 16, 0, 4],
      },
      {
        ul: missingColumns,
        style: 'missingItem',
        margin: [10, 0, 0, 0],
      }
    );
  }

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 32, 24, 36],
    footer: (currentPage, pageCount) => ({
      text: `Página ${currentPage} de ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: MUTED,
      margin: [0, 12, 0, 0],
    }),
    content,
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: TEXT_DARK },
    styles: {
      title: { fontSize: 16, bold: true, color: TEXT_DARK },
      subtitle: { fontSize: 9, italics: true, color: MUTED },
      sectionHeader: { fontSize: 10, bold: true, color: TEXT_DARK },
      filterItem: { fontSize: 9, color: TEXT_DARK },
      tableHeader: { color: '#FFFFFF', bold: true, fontSize: 9 },
      tableCell: { fontSize: 8, color: TEXT_DARK },
      emptyNote: { fontSize: 10, italics: true, color: MUTED, alignment: 'center' },
      missingHeader: { fontSize: 9, bold: true, italics: true, color: WARN_AMBER },
      missingItem: { fontSize: 8, italics: true, color: MUTED },
    },
  };

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
