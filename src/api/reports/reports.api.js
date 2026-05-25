import { Router } from 'express';
import { verify_token, is_authenticated } from '../../utils/token.js';
import { handler as r1 } from './reports/r1-matricula-cftp.js';
import { handler as r2 } from './reports/r2-listado-jovenes.js';
import { handler as r3 } from './reports/r3-retencion.js';
import { handler as r4 } from './reports/r4-seguimiento.js';
import { handler as r5 } from './reports/r5-kits.js';
import { handler as r6 } from './reports/r6-ingreso-proyecto.js';
import { handler as r7 } from './reports/r7-ingreso-consolidado.js';
import { handler as r8 } from './reports/r8-overhead.js';
import { handler as r9 } from './reports/r9-presupuesto.js';
import { handler as r10 } from './reports/r10-empresas.js';
import { handler as r11 } from './reports/r11-template.js';
import { generateReportPdf } from './pdf-builder.js';

// Reportes activos: R1-R11. R12-R14 (Contratado a Centros, Pagado a Instructores,
// Estipendios a jóvenes) están fuera de alcance — esos pagos no se manejan en
// el ERP CADERH. Sus requerimientos viven en docs/requerimientos-modulo-reportes.md
// como referencia histórica del cliente.

const REPORT_HANDLERS = {
  'r1-matricula-cftp': r1,
  'r2-listado-jovenes': r2,
  'r3-retencion': r3,
  'r4-seguimiento-post-formacion': r4,
  'r5-kits-emprendimiento': r5,
  'r6-ingreso-proyecto': r6,
  'r7-ingreso-consolidado': r7,
  'r8-overhead': r8,
  'r9-presupuesto-vs-ejecutado': r9,
  'r10-empresas-donantes': r10,
  'r11-informe-ac-r-022': r11,
};

export const router = Router();

router.get('/', (_req, res) => {
  res.json({
    message: 'CADERH Reports API',
    available: [
      'r1-matricula-cftp',
      'r2-listado-jovenes',
      'r3-retencion',
      'r4-seguimiento-post-formacion',
      'r5-kits-emprendimiento',
      'r6-ingreso-proyecto',
      'r7-ingreso-consolidado',
      'r8-overhead',
      'r9-presupuesto-vs-ejecutado',
      'r10-empresas-donantes',
      'r11-informe-ac-r-022',
    ],
  });
});

// All report endpoints require auth:
router.use(verify_token, is_authenticated);

router.get('/r1-matricula-cftp', r1);
router.get('/r2-listado-jovenes', r2);
router.get('/r3-retencion', r3);
router.get('/r4-seguimiento-post-formacion', r4);
router.get('/r5-kits-emprendimiento', r5);
router.get('/r6-ingreso-proyecto', r6);
router.get('/r7-ingreso-consolidado', r7);
router.get('/r8-overhead', r8);
router.get('/r9-presupuesto-vs-ejecutado', r9);
router.get('/r10-empresas-donantes', r10);
router.get('/r11-informe-ac-r-022', r11);

// ─── PDF export ─────────────────────────────────────────────────────────────
// Generic export endpoint: replays the report handler with the supplied filters
// to obtain rows, then builds a PDF using the column metadata sent from the
// frontend (which holds the canonical column definitions).
router.post('/:reportId/export/pdf', async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const handler = REPORT_HANDLERS[reportId];
    if (!handler) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const {
      filters = {},
      columns = [],
      title = reportId,
      subtitle,
      code,
    } = req.body ?? {};

    // Replay the report handler against a synthetic request whose `query`
    // mirrors the filters payload. We capture the JSON response instead of
    // letting it write to the wire.
    let captured = null;
    let captureError = null;
    const fakeReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, {
      query: { ...filters },
      method: 'GET',
    });
    const fakeRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { captured = { statusCode: this.statusCode, payload }; return this; },
      send(payload) { captured = { statusCode: this.statusCode, payload }; return this; },
    };
    const fakeNext = (err) => { if (err) captureError = err; };

    await handler(fakeReq, fakeRes, fakeNext);

    if (captureError) throw captureError;
    if (!captured) {
      return res.status(500).json({ message: 'No se pudo obtener datos del reporte' });
    }
    if (captured.statusCode >= 400) {
      return res.status(captured.statusCode).json(captured.payload);
    }

    const rows = captured.payload?.rows ?? [];
    const meta = captured.payload?.meta ?? {};

    const missingColumns = Array.isArray(columns)
      ? columns.filter((c) => c?.missingInDb).map((c) => c.label || c.key)
      : [];

    const buffer = await generateReportPdf({
      title,
      subtitle,
      code,
      columns,
      rows,
      filtersApplied: filters,
      missingColumns: missingColumns.length > 0 ? missingColumns : (meta.missingColumns ?? []),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(code || reportId).toString().replace(/[^A-Za-z0-9_-]/g, '_')}_${reportId}.pdf"`
    );
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// Per-report routes added in subsequent tasks.
