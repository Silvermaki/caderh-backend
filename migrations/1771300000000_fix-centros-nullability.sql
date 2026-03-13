-- ============================================================================
-- Fix nullability: alinear DB con campos requeridos del frontend
-- ============================================================================

-- INSTRUCTORS: drop FK constraints antes de modificar columnas
ALTER TABLE centros.instructors DROP CONSTRAINT IF EXISTS instructors_departamento_id_foreign;
ALTER TABLE centros.instructors DROP CONSTRAINT IF EXISTS instructors_municipio_id_foreign;
ALTER TABLE centros.instructors DROP CONSTRAINT IF EXISTS instructors_nivel_escolaridad_id_foreign;

-- INSTRUCTORS: hacer columnas nullable
ALTER TABLE centros.instructors ALTER COLUMN identidad DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN departamento_id DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN municipio_id DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN sexo DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN estado_civil DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN nivel_escolaridad_id DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN nivel_escolaridad_id DROP DEFAULT;
ALTER TABLE centros.instructors ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE centros.instructors ALTER COLUMN usuario_id DROP DEFAULT;

-- INSTRUCTORS: limpiar datos dummy
UPDATE centros.instructors SET identidad = NULL WHERE identidad = 'N/A';
UPDATE centros.instructors SET sexo = NULL WHERE sexo = 'N/A';
UPDATE centros.instructors SET estado_civil = NULL WHERE estado_civil = 'N/A';
UPDATE centros.instructors SET departamento_id = NULL WHERE departamento_id = 0;
UPDATE centros.instructors SET municipio_id = NULL WHERE municipio_id = 0;
UPDATE centros.instructors SET nivel_escolaridad_id = NULL WHERE nivel_escolaridad_id = 0;
UPDATE centros.instructors SET usuario_id = NULL WHERE usuario_id = 0;

-- INSTRUCTORS: re-agregar FKs con ON DELETE SET NULL
ALTER TABLE centros.instructors ADD CONSTRAINT instructors_departamento_id_foreign
    FOREIGN KEY (departamento_id) REFERENCES centros.departamentos(id) ON DELETE SET NULL;
ALTER TABLE centros.instructors ADD CONSTRAINT instructors_municipio_id_foreign
    FOREIGN KEY (municipio_id) REFERENCES centros.municipios(id) ON DELETE SET NULL;
ALTER TABLE centros.instructors ADD CONSTRAINT instructors_nivel_escolaridad_id_foreign
    FOREIGN KEY (nivel_escolaridad_id) REFERENCES centros.nivel_escolaridads(id) ON DELETE SET NULL;

-- ESTUDIANTES: sangre nullable
ALTER TABLE centros.estudiantes ALTER COLUMN sangre DROP NOT NULL;
UPDATE centros.estudiantes SET sangre = NULL WHERE sangre = 'N/A';

-- CURSOS: codigo y total_horas nullable
ALTER TABLE centros.cursos ALTER COLUMN codigo DROP NOT NULL;
ALTER TABLE centros.cursos ALTER COLUMN total_horas DROP NOT NULL;
ALTER TABLE centros.cursos ALTER COLUMN total_horas SET DEFAULT '0';

-- PROCESOS: fuente_financiamiento_id nullable
ALTER TABLE centros.procesos ALTER COLUMN fuente_financiamiento_id DROP NOT NULL;
UPDATE centros.procesos SET fuente_financiamiento_id = NULL WHERE fuente_financiamiento_id = 0;

-- Eliminar registro dummy de nivel_escolaridads
DELETE FROM centros.nivel_escolaridads WHERE id = 0 AND nombre = 'Sin especificar';
