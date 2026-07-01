-- Up Migration

-- Presupuesto total del proyecto (req 5, PDF requerimientos): monto planificado
-- de referencia para control presupuestario. En centavos, como los demás montos.
-- NO se suma a los ingresos recibidos (fuentes/donaciones); es solo referencia.
ALTER TABLE caderh.projects
  ADD COLUMN IF NOT EXISTS total_budget BIGINT;

-- Down Migration
-- ALTER TABLE caderh.projects DROP COLUMN IF EXISTS total_budget;
