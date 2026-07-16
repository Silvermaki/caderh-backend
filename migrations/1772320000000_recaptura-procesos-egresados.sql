-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- Mejoras a PROCESOS EDUCATIVOS, MATRÍCULAS y EGRESADOS sobre tablas vacías
-- (recaptura 1772300000000).
--
--   · egresados no guardaba DE QUÉ PROCESO egresó la persona: R3 lo atribuía
--     por heurística ("proceso más reciente") y 32/232 egresos eran ambiguos.
--   · proceso_matriculas permitía matricular dos veces a la misma persona en
--     el mismo proceso.
--   · procesos.fuente_financiamiento_id: entero huérfano hacia una tabla que
--     nunca se migró de MySQL (confirmado con el equipo: ya no se usa; el
--     vínculo real es caderh.projects_processes → project_financing_sources).
--   · duracion_horas era TEXT; dias era JSON doblemente escapado.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Egreso atado a la matrícula exacta (un egreso por matrícula). Los campos
--    de empleabilidad se capturan EN el egreso (antes "Emprendiendo" se leía
--    de estudiantes.autoempleo, un dato de inscripción, no de seguimiento).
ALTER TABLE centros.egresados
  ADD COLUMN proceso_matricula_id integer NOT NULL
    REFERENCES centros.proceso_matriculas(id),
  ADD CONSTRAINT egresados_matricula_uq UNIQUE (proceso_matricula_id),
  ADD COLUMN autoempleo integer NOT NULL DEFAULT 0,
  ADD COLUMN puesto text,
  ADD COLUMN rango_salario text;

ALTER TABLE centros.egresados
  ADD CONSTRAINT egresados_flags_chk CHECK (
    practica_profesional IN (0, 1) AND
    estudiando           IN (0, 1) AND
    buscando_empleo      IN (0, 1) AND
    trabaja_actualmente  IN (0, 1) AND
    autoempleo           IN (0, 1)
  ),
  ADD CONSTRAINT egresados_tipo_egreso_chk CHECK (tipo_egreso BETWEEN 1 AND 4);

COMMENT ON COLUMN centros.egresados.tipo_egreso IS
  'Códigos 1-4 heredados del SGC; catálogo formal pendiente de documentar con CADERH.';

-- 2. Una matrícula por persona por proceso + códigos acotados.
ALTER TABLE centros.proceso_matriculas
  ADD CONSTRAINT proceso_matriculas_unica_uq UNIQUE (proceso_id, estudiante_id),
  ADD CONSTRAINT proceso_matriculas_tipo_chk CHECK (tipo_matricula IN (1, 2)),
  ADD CONSTRAINT proceso_matriculas_estatus_chk CHECK (estatus IN (0, 1, 2));

COMMENT ON COLUMN centros.proceso_matriculas.estatus IS
  '1 = activa · 2 = retirada · 0 = anulada (semántica heredada del SGC).';

-- 3. Procesos: fuera la columna huérfana; tipos y coherencia de fechas.
ALTER TABLE centros.procesos
  DROP COLUMN IF EXISTS fuente_financiamiento_id;

ALTER TABLE centros.procesos
  ALTER COLUMN duracion_horas TYPE integer USING duracion_horas::integer;
ALTER TABLE centros.procesos
  ADD CONSTRAINT procesos_duracion_horas_chk CHECK (duracion_horas > 0),
  ADD CONSTRAINT procesos_fechas_chk CHECK (fecha_final >= fecha_inicial);

-- 4. dias: se conserva TEXT por compatibilidad con los lectores, pero solo en
--    su forma canónica: array JSON de dígitos "1".."7" sin escapes
--    (ej. ["2","3","5"]). Muere la variante [\"2\"] heredada del doble escape.
ALTER TABLE centros.procesos
  ADD CONSTRAINT procesos_dias_chk
  CHECK (dias ~ '^\[\s*("[1-7]"(\s*,\s*"[1-7]")*)?\s*\]$');

-- Nota: horario sigue siendo texto libre a propósito — convertirlo a
-- hora_inicio/hora_fin TIME requiere rediseñar la captura y definir el
-- catálogo de jornadas con CADERH (pendiente de reunión, doc v3).

-- Down Migration
ALTER TABLE centros.procesos DROP CONSTRAINT IF EXISTS procesos_dias_chk;
ALTER TABLE centros.procesos DROP CONSTRAINT IF EXISTS procesos_fechas_chk;
ALTER TABLE centros.procesos DROP CONSTRAINT IF EXISTS procesos_duracion_horas_chk;
ALTER TABLE centros.procesos
  ALTER COLUMN duracion_horas TYPE text USING duracion_horas::text;
ALTER TABLE centros.procesos ADD COLUMN IF NOT EXISTS fuente_financiamiento_id integer;
ALTER TABLE centros.proceso_matriculas DROP CONSTRAINT IF EXISTS proceso_matriculas_estatus_chk;
ALTER TABLE centros.proceso_matriculas DROP CONSTRAINT IF EXISTS proceso_matriculas_tipo_chk;
ALTER TABLE centros.proceso_matriculas DROP CONSTRAINT IF EXISTS proceso_matriculas_unica_uq;
ALTER TABLE centros.egresados DROP CONSTRAINT IF EXISTS egresados_tipo_egreso_chk;
ALTER TABLE centros.egresados DROP CONSTRAINT IF EXISTS egresados_flags_chk;
ALTER TABLE centros.egresados
  DROP COLUMN IF EXISTS rango_salario,
  DROP COLUMN IF EXISTS puesto,
  DROP COLUMN IF EXISTS autoempleo;
ALTER TABLE centros.egresados DROP CONSTRAINT IF EXISTS egresados_matricula_uq;
ALTER TABLE centros.egresados DROP COLUMN IF EXISTS proceso_matricula_id;
