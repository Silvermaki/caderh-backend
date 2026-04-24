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

// Per-report routes added in subsequent tasks.
