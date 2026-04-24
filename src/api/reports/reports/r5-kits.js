import { reportHandler } from '../shared.js';

// R5: Kits de emprendimiento. Tabla destino no implementada todavía.

export const handler = reportHandler(async (_req) => ({
  rows: [],
  total: 0,
  meta: {
    missingColumns: [
      'jovenNombre','jovenDni','proyecto','emprendimiento',
      'rubro','fechaEntrega','montoOtorgado','estadoSeguimiento',
    ],
  },
}));
