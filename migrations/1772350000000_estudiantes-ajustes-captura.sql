-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- Ajustes a la ficha del estudiante pedidos por CADERH (notas del 18/08/2026)
-- y corrección de datos de catálogo:
--
--   · tipo_contrato_ant era INTEGER mientras el formulario lo pedía como texto
--     libre: lo escrito se descartaba en silencio (normalize-captura lo pasaba
--     por intOrDefault). Pasa a TEXT con los valores del Anexo I del cliente.
--     En prd y en local la columna está vacía (141/141 NULL), no hay nada que
--     convertir; si apareciera un valor inesperado la migración se detiene.
--   · Discapacidad: opción "Otra" en el catálogo y campo abierto para
--     especificar la discapacidad o su razón.
--   · Observaciones generales del joven ("Información adicional" del 18/08;
--     el Word pide observaciones con un número determinado de caracteres).
--   · Municipios 41 y 167 guardados con doble codificación UTF-8
--     ("CabaÃƒÂ±as"): se corrigen a "Cabañas".
-- ─────────────────────────────────────────────────────────────────────────────

-- 0 = "sin dato": el formulario anterior enviaba Number(texto) || 0, así que
-- un guardado hecho antes del despliegue deja 0 y no debe frenar la migración.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM centros.estudiantes WHERE tipo_contrato_ant IS NOT NULL AND tipo_contrato_ant <> 0) THEN
    RAISE EXCEPTION 'tipo_contrato_ant tiene valores numéricos heredados: revisar a mano antes de migrar (no hay tabla de equivalencias).';
  END IF;
END $$;

ALTER TABLE centros.estudiantes
  ALTER COLUMN tipo_contrato_ant TYPE text USING NULL;
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_tipo_contrato_ant_chk
  CHECK (tipo_contrato_ant IS NULL OR tipo_contrato_ant IN ('Permanente', 'Temporal', 'Por eventos', 'Ninguno'));
COMMENT ON COLUMN centros.estudiantes.tipo_contrato_ant IS
  'Tipo de contratación del empleo anterior a la inscripción: Permanente, Temporal, Por eventos o Ninguno.';

INSERT INTO centros.discapacidads (nombre, estatus, created_at, updated_at)
SELECT 'Otra', 1, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM centros.discapacidads WHERE lower(trim(nombre)) IN ('otra', 'otras', 'otro', 'otros')
);

ALTER TABLE centros.estudiantes
  ADD COLUMN discapacidad_detalle text,
  ADD COLUMN observaciones text;
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_discapacidad_detalle_len_chk
    CHECK (discapacidad_detalle IS NULL OR char_length(discapacidad_detalle) <= 300),
  ADD CONSTRAINT estudiantes_observaciones_len_chk
    CHECK (observaciones IS NULL OR char_length(observaciones) <= 1000);
COMMENT ON COLUMN centros.estudiantes.discapacidad_detalle IS
  'Especificación libre de la discapacidad (obligatoria en la captura cuando es "Otra").';
COMMENT ON COLUMN centros.estudiantes.observaciones IS
  'Información adicional general del joven (máx. 1000 caracteres).';

UPDATE centros.municipios
   SET nombre = 'Cabañas'
 WHERE id IN (41, 167)
   AND nombre LIKE 'Caba%as'
   AND nombre <> 'Cabañas';

-- Down Migration
-- La corrección de "Cabañas" no se revierte: el valor anterior era texto
-- corrupto. Bajar tipo_contrato_ant a INTEGER pierde lo capturado como texto.
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_observaciones_len_chk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_discapacidad_detalle_len_chk;
ALTER TABLE centros.estudiantes DROP COLUMN IF EXISTS observaciones;
ALTER TABLE centros.estudiantes DROP COLUMN IF EXISTS discapacidad_detalle;
DELETE FROM centros.discapacidads d
 WHERE d.nombre = 'Otra'
   AND NOT EXISTS (SELECT 1 FROM centros.estudiantes e WHERE e.discapacidad_id = d.id);
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_tipo_contrato_ant_chk;
ALTER TABLE centros.estudiantes ALTER COLUMN tipo_contrato_ant TYPE integer USING NULL;
