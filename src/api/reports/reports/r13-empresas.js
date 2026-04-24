import { reportHandler } from '../shared.js';

export const handler = reportHandler(async (_req) => ({
  rows: [],
  total: 0,
  meta: {
    missingColumns: [
      'nombre','tipo','rubro','ubicacion',
      'contactoNombre','contactoCargo','contactoTelefono','contactoCorreo',
      'jovenesColocados','pasantesRecibidos','donacionesRecibidas','proyectosParticipa',
    ],
    note: 'Módulo Empresas/Donantes no implementado',
  },
}));
