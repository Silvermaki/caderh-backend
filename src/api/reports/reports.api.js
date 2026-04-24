import { Router } from 'express';
import { verify_token, is_authenticated } from '../../utils/token.js';
import { handler as r6 } from './reports/r6-ingreso-proyecto.js';
import { handler as r7 } from './reports/r7-ingreso-consolidado.js';

// Report handlers will be imported + registered as T11-T21 add them.

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

router.get('/r6-ingreso-proyecto', r6);
router.get('/r7-ingreso-consolidado', r7);

// Per-report routes added in subsequent tasks.
