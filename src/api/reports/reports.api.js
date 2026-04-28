import { Router } from 'express';
import { verify_token, is_authenticated } from '../../utils/token.js';
import { handler as r1 } from './reports/r1-matricula-cftp.js';
import { handler as r6 } from './reports/r6-ingreso-proyecto.js';
import { handler as r7 } from './reports/r7-ingreso-consolidado.js';
import { handler as r8 } from './reports/r8-overhead.js';
import { handler as r12 } from './reports/r12-presupuesto.js';
import { handler as r2 } from './reports/r2-listado-jovenes.js';
import { handler as r3 } from './reports/r3-retencion.js';
import { handler as r4 } from './reports/r4-seguimiento.js';
import { handler as r5  } from './reports/r5-kits.js';
import { handler as r13 } from './reports/r13-empresas.js';
import { handler as r14 } from './reports/r14-template.js';
import { generateReportPdf } from './pdf-builder.js';

// Report handlers will be imported + registered as T11-T21 add them.

const REPORT_HANDLERS = {
  'r1-matricula-cftp': r1,
  'r2-listado-jovenes': r2,
  'r3-retencion': r3,
  'r4-seguimiento-post-formacion': r4,
  'r5-kits-emprendimiento': r5,
  'r6-ingreso-proyecto': r6,
  'r7-ingreso-consolidado': r7,
  'r8-overhead': r8,
  'r12-presupuesto-vs-ejecutado': r12,
  'r13-empresas-donantes': r13,
  'r14-informe-ac-r-022': r14,
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
      'r12-presupuesto-vs-ejecutado',
      'r13-empresas-donantes',
      'r14-informe-ac-r-022',
    ],
  });
});

// All report endpoints require auth:
router.use(verify_token, is_authenticated);

router.get('/r1-matricula-cftp', r1);
router.get('/r6-ingreso-proyecto', r6);
router.get('/r7-ingreso-consolidado', r7);
router.get('/r8-overhead', r8);
router.get('/r12-presupuesto-vs-ejecutado', r12);
router.get('/r2-listado-jovenes', r2);
router.get('/r3-retencion', r3);
router.get('/r4-seguimiento-post-formacion', r4);
router.get('/r5-kits-emprendimiento', r5);
router.get('/r13-empresas-donantes',  r13);
router.get('/r14-informe-ac-r-022', r14);

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
