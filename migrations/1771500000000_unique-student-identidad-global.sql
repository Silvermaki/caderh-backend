-- Make student identidad globally unique (not per-centro)
-- Drop per-centro composite unique constraint
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_centro_id_identidad_key;

-- Add global unique index (only active students, so deleted ones don't block reuse)
CREATE UNIQUE INDEX estudiantes_identidad_unique ON centros.estudiantes (identidad) WHERE estatus = 1;
