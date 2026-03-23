-- Make estado_civil optional for students
ALTER TABLE centros.estudiantes ALTER COLUMN estado_civil DROP NOT NULL;
