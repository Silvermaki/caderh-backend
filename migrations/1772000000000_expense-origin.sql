-- Up Migration

-- Origen opcional del gasto: un gasto puede tomarse de una fuente de
-- financiamiento específica o de una donación específica del proyecto.
-- Ambas columnas son NULL cuando el gasto sale del "pozo general".
-- Se usa ON DELETE SET NULL para que borrar la fuente/donación no borre el
-- gasto; simplemente vuelve al pozo general.
ALTER TABLE caderh.project_expenses
  ADD COLUMN IF NOT EXISTS project_financing_source_id UUID
    REFERENCES caderh.project_financing_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_donation_id UUID
    REFERENCES caderh.project_donations(id) ON DELETE SET NULL;

-- Un gasto no puede tener a la vez fuente y donación como origen.
ALTER TABLE caderh.project_expenses
  DROP CONSTRAINT IF EXISTS project_expenses_single_origin_chk;
ALTER TABLE caderh.project_expenses
  ADD CONSTRAINT project_expenses_single_origin_chk
  CHECK (project_financing_source_id IS NULL OR project_donation_id IS NULL);

-- Down Migration
-- ALTER TABLE caderh.project_expenses DROP CONSTRAINT IF EXISTS project_expenses_single_origin_chk;
-- ALTER TABLE caderh.project_expenses DROP COLUMN IF EXISTS project_donation_id;
-- ALTER TABLE caderh.project_expenses DROP COLUMN IF EXISTS project_financing_source_id;
