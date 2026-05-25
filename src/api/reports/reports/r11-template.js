import { reportHandler } from '../shared.js';

// R11: Plantilla AC-R-022 (Informe trimestral) — requiere XLSX pixel-perfect generation.
// Implementación completa pendiente: template .xlsx como asset + ExcelJS.

export const handler = reportHandler(async (_req) => ({
  rows: [],
  total: 0,
  meta: {
    note: 'Plantilla AC-R-022 pendiente de implementación pixel-perfect',
    missingColumns: ['plantillaExcel'],
  },
}));
