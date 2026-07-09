-- Up Migration

-- Estatus explícito de "cancelado" para procesos educativos: el estado derivado
-- (Próximamente/En progreso/Finalizado) se calcula por fechas, pero un proceso
-- puede cancelarse en cualquier momento y debe mostrarse como tal en la ficha.
ALTER TABLE centros.procesos
  ADD COLUMN IF NOT EXISTS cancelado BOOLEAN NOT NULL DEFAULT false;

-- Down Migration
-- ALTER TABLE centros.procesos DROP COLUMN IF EXISTS cancelado;
