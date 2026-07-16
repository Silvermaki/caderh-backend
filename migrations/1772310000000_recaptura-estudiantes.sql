-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- Mejoras al almacenamiento de ESTUDIANTES, aprovechando que la tabla queda
-- vacía por la recaptura (migración 1772300000000). Cada cambio elimina un
-- parche defensivo que hoy vive en los lectores (reportes R1–R4, fichas):
--
--   · fecha_nacimiento era TEXT: la data SGC traía años 0000 (reventaba el
--     cast en R1/R3) y 0021–0200 (edades absurdas). 488 vacías.
--   · sexo era texto libre ('Masculino'/'Femenino'), con DOS normalizaciones
--     divergentes en el código. Canónico nuevo: 'M' / 'F'.
--   · identidad tenía 2 formatos (con/sin guiones) → 106 duplicados lógicos
--     que el UNIQUE existente no detectaba. Canónico: ####-####-#####.
--   · vive / nivel_escolaridad_id / discapacidad_id / etnia_id eran TEXT con
--     JSON doblemente escapado ([\"1\"]) y el string literal 'null'.
--   · 9 banderas sí/no eran INTEGER sin rango (aceptaban 2, 99, -1).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Fecha de nacimiento: tipo real + rango sensato.
--    (CHECK usa CURRENT_DATE — no inmutable, pero es el patrón aceptado para
--    validar "edad mínima" en captura; se evalúa al insertar/actualizar.)
ALTER TABLE centros.estudiantes
  ALTER COLUMN fecha_nacimiento TYPE date USING fecha_nacimiento::date;
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_fecha_nacimiento_chk
  CHECK (fecha_nacimiento IS NULL OR
         (fecha_nacimiento >= DATE '1930-01-01' AND
          fecha_nacimiento <= CURRENT_DATE - INTERVAL '10 years'));

-- 2. Sexo canónico M/F (los lectores ya normalizan ambas variantes, así que
--    los reportes siguen funcionando; la captura debe enviar M/F).
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_sexo_chk CHECK (sexo IN ('M', 'F'));

-- 3. DNI canónico con guiones (####-####-#####). El UNIQUE parcial global ya
--    existe (estudiantes_identidad_unique, migración 1771500000000); con un
--    solo formato posible, deja de haber duplicados "lógicos".
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_identidad_formato_chk
  CHECK (identidad ~ '^[0-9]{4}-[0-9]{4}-[0-9]{5}$');

-- 4. "¿Con quién vive?": valor canónico del catálogo de 5 opciones (antes JSON
--    posicional escapado; el mapa 1..5 vivía hardcodeado en backend y frontend).
--    La columna es NOT NULL de origen, se conserva.
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_vive_chk
  CHECK (vive IN ('Padres', 'Solo(a)', 'Pareja', 'Familiares', 'Otros'));

-- 5. Catálogos reales en vez de TEXT-JSON: FKs a tablas que ya existen.
ALTER TABLE centros.estudiantes
  ALTER COLUMN nivel_escolaridad_id TYPE integer USING NULL,
  ALTER COLUMN discapacidad_id      TYPE integer USING NULL,
  ALTER COLUMN etnia_id             TYPE integer USING NULL;
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_nivel_escolaridad_fk
    FOREIGN KEY (nivel_escolaridad_id) REFERENCES centros.nivel_escolaridads(id),
  ADD CONSTRAINT estudiantes_discapacidad_fk
    FOREIGN KEY (discapacidad_id) REFERENCES centros.discapacidads(id),
  ADD CONSTRAINT estudiantes_etnia_fk
    FOREIGN KEY (etnia_id) REFERENCES centros.etnias(id);

-- 6. Banderas sí/no acotadas a 0/1 (siguen siendo INTEGER para no romper los
--    lectores existentes que comparan = 1; la conversión a boolean queda para
--    una fase posterior junto con el código).
ALTER TABLE centros.estudiantes
  ADD CONSTRAINT estudiantes_flags_chk CHECK (
    estudia        IN (0, 1) AND
    trabajo_actual IN (0, 1) AND
    especial       IN (0, 1) AND
    riesgo_social  IN (0, 1) AND
    interno        IN (0, 1) AND
    tiene_hijos    IN (0, 1) AND
    trabajado_ant  IN (0, 1) AND
    autoempleo     IN (0, 1) AND
    socios         IN (0, 1)
  );

-- Down Migration
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_flags_chk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_etnia_fk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_discapacidad_fk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_nivel_escolaridad_fk;
ALTER TABLE centros.estudiantes
  ALTER COLUMN nivel_escolaridad_id TYPE text USING nivel_escolaridad_id::text,
  ALTER COLUMN discapacidad_id      TYPE text USING discapacidad_id::text,
  ALTER COLUMN etnia_id             TYPE text USING etnia_id::text;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_vive_chk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_identidad_formato_chk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_sexo_chk;
ALTER TABLE centros.estudiantes DROP CONSTRAINT IF EXISTS estudiantes_fecha_nacimiento_chk;
ALTER TABLE centros.estudiantes
  ALTER COLUMN fecha_nacimiento TYPE text USING fecha_nacimiento::text;
