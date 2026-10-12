-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo de egresados y seguimiento (diseño en docs/analisis-formatos-cliente.md §6).
--
--   1. Cierre de la matrícula: resultado del curso por matrícula (egresó o
--      desertó), con fecha y motivo de deserción. Alimenta la matrícula final
--      (AC-R-022), R3 · % de retención y la meta de "completan la capacitación".
--   2. Pasantía: 0..1 por matrícula (empresa, fechas, resultado, beneficio).
--   3. Seguimiento: 0..n por matrícula, un registro por fecha de corte, con un
--      estatus único de lista cerrada (los que usan los archivos del cliente)
--      y el detalle según el estatus. Los reportes leen el estatus "al corte".
--
-- Los códigos se validan con CHECK; las etiquetas viven en el código
-- (src/utils/egresados-catalogos.js y su espejo en el frontend).
-- La tabla heredada centros.egresados queda sin uso (estaba vacía).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE centros.proceso_matriculas
  ADD COLUMN resultado text,
  ADD COLUMN fecha_resultado date,
  ADD COLUMN motivo_desercion text,
  ADD COLUMN observacion_resultado text;
ALTER TABLE centros.proceso_matriculas
  ADD CONSTRAINT proceso_matriculas_resultado_chk
    CHECK (resultado IS NULL OR resultado IN ('EGRESADO', 'DESERTOR')),
  ADD CONSTRAINT proceso_matriculas_resultado_fecha_chk
    CHECK ((resultado IS NULL) = (fecha_resultado IS NULL)),
  ADD CONSTRAINT proceso_matriculas_motivo_chk
    CHECK (
      motivo_desercion IS NULL
      OR (resultado = 'DESERTOR' AND motivo_desercion IN ('DESINTERES', 'ECONOMICO', 'MIGRACION', 'DOMICILIO', 'OTRO'))
    );
COMMENT ON COLUMN centros.proceso_matriculas.resultado IS
  'Resultado del curso: EGRESADO o DESERTOR. NULL = sin cierre (en curso o pendiente de registrar).';
COMMENT ON COLUMN centros.proceso_matriculas.fecha_resultado IS
  'Fecha de egreso o de deserción. Obligatoria cuando hay resultado.';

CREATE TABLE centros.pasantias (
  id serial PRIMARY KEY,
  proceso_matricula_id integer NOT NULL UNIQUE
    REFERENCES centros.proceso_matriculas (id) ON DELETE CASCADE,
  empresa text,
  fecha_inicio date,
  fecha_fin date,
  resultado text NOT NULL DEFAULT 'EN_CURSO',
  motivo_desercion text,
  porcentaje_avance integer,
  beneficio text,
  beneficio_otorgado_por text,
  observaciones text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_resultado_chk CHECK (resultado IN ('EN_CURSO', 'COMPLETADA', 'DESERTO')),
  CONSTRAINT pasantias_fechas_chk CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT pasantias_avance_chk CHECK (porcentaje_avance IS NULL OR porcentaje_avance BETWEEN 0 AND 100),
  CONSTRAINT pasantias_motivo_chk CHECK (
    motivo_desercion IS NULL
    OR (resultado = 'DESERTO' AND motivo_desercion IN ('DESINTERES', 'ECONOMICO', 'MIGRACION', 'DOMICILIO', 'OTRO'))
  )
);
COMMENT ON TABLE centros.pasantias IS 'Pasantía del egresado (0 o 1 por matrícula).';

CREATE TABLE centros.seguimientos (
  id serial PRIMARY KEY,
  proceso_matricula_id integer NOT NULL
    REFERENCES centros.proceso_matriculas (id) ON DELETE CASCADE,
  fecha_corte date NOT NULL,
  estatus text NOT NULL,
  empresa text,
  puesto text,
  rango_salario text,
  negocio text,
  rubro text,
  rango_ingreso text,
  kit_entregado boolean,
  kit_monto_cents bigint,
  institucion text,
  carrera text,
  fecha_inicio date,
  observaciones text,
  registrado_por uuid REFERENCES caderh.users (id) ON DELETE SET NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT seguimientos_corte_uq UNIQUE (proceso_matricula_id, fecha_corte),
  CONSTRAINT seguimientos_estatus_chk CHECK (estatus IN (
    'TRABAJO_PERMANENTE', 'TRABAJO_TEMPORAL', 'EMPRENDIENDO', 'ESTUDIANDO',
    'BUSQUEDA_EMPLEO', 'EN_PASANTIA', 'OTRO', 'NO_APLICA'
  )),
  CONSTRAINT seguimientos_kit_monto_chk CHECK (kit_monto_cents IS NULL OR kit_monto_cents >= 0)
);
CREATE INDEX seguimientos_matricula_corte_idx
  ON centros.seguimientos (proceso_matricula_id, fecha_corte DESC);
COMMENT ON TABLE centros.seguimientos IS
  'Historial de seguimiento del egresado: un registro por matrícula y fecha de corte.';
COMMENT ON COLUMN centros.seguimientos.kit_monto_cents IS 'Monto del kit de emprendimiento en centavos de Lempira.';

-- Down Migration
DROP TABLE IF EXISTS centros.seguimientos;
DROP TABLE IF EXISTS centros.pasantias;
ALTER TABLE centros.proceso_matriculas DROP CONSTRAINT IF EXISTS proceso_matriculas_motivo_chk;
ALTER TABLE centros.proceso_matriculas DROP CONSTRAINT IF EXISTS proceso_matriculas_resultado_fecha_chk;
ALTER TABLE centros.proceso_matriculas DROP CONSTRAINT IF EXISTS proceso_matriculas_resultado_chk;
ALTER TABLE centros.proceso_matriculas
  DROP COLUMN IF EXISTS observacion_resultado,
  DROP COLUMN IF EXISTS motivo_desercion,
  DROP COLUMN IF EXISTS fecha_resultado,
  DROP COLUMN IF EXISTS resultado;
