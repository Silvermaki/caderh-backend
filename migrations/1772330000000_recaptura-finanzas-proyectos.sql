-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- Mejoras a PROYECTOS, FUENTES, DONACIONES y GASTOS sobre tablas vacías
-- (recaptura 1772300000000).
--
--   · Los gastos NO tenían fecha propia: R6/R8/R9 derivaban el trimestre de
--     created_dt (la fecha en que se DIGITÓ el dato, no la del gasto).
--   · disbursement_date era opcional (19/21 fuentes y 16/24 donaciones sin
--     fecha) → los trimestres de R6/R7 caían a created_dt vía COALESCE y R6
--     necesitaba un bucket entero "sin fecha".
--   · Sin CHECKs de montos ni de coherencia de fechas de proyecto.
--   · financing_sources.name sin UNIQUE (la recaptura podía crear "USAID" y
--     "usaid " como fuentes distintas y fragmentar R6/R7).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Fecha de negocio del gasto, obligatoria (la captura debe pedirla).
ALTER TABLE caderh.project_expenses
  ADD COLUMN expense_date date NOT NULL;
COMMENT ON COLUMN caderh.project_expenses.expense_date IS
  'Fecha en que se ejecutó el gasto (fecha de negocio). created_dt es solo la fecha de captura.';

-- 2. Fecha de ingreso obligatoria en fuentes y donaciones.
ALTER TABLE caderh.project_financing_sources
  ALTER COLUMN disbursement_date SET NOT NULL;
ALTER TABLE caderh.project_donations
  ALTER COLUMN disbursement_date SET NOT NULL;

-- 3. Montos siempre positivos (en CENTAVOS, convención de todo el schema).
ALTER TABLE caderh.project_financing_sources
  ADD CONSTRAINT project_financing_sources_amount_chk CHECK (amount > 0);
ALTER TABLE caderh.project_donations
  ADD CONSTRAINT project_donations_amount_chk CHECK (amount > 0);
ALTER TABLE caderh.project_expenses
  ADD CONSTRAINT project_expenses_amount_chk CHECK (amount > 0);
COMMENT ON COLUMN caderh.project_financing_sources.amount IS 'Monto en centavos de Lempira.';
COMMENT ON COLUMN caderh.project_donations.amount IS 'Monto en centavos de Lempira.';
COMMENT ON COLUMN caderh.project_expenses.amount IS 'Monto en centavos de Lempira.';

-- 4. Coherencia de fechas y presupuesto de referencia del proyecto.
ALTER TABLE caderh.projects
  ADD CONSTRAINT projects_fechas_chk CHECK (end_date >= start_date),
  ADD CONSTRAINT projects_total_budget_chk
    CHECK (total_budget IS NULL OR total_budget >= 0);

-- 5. Catálogo de fuentes sin duplicados por mayúsculas/espacios.
CREATE UNIQUE INDEX financing_sources_name_uq
  ON caderh.financing_sources (lower(trim(name)));

-- Down Migration
DROP INDEX IF EXISTS caderh.financing_sources_name_uq;
ALTER TABLE caderh.projects DROP CONSTRAINT IF EXISTS projects_total_budget_chk;
ALTER TABLE caderh.projects DROP CONSTRAINT IF EXISTS projects_fechas_chk;
ALTER TABLE caderh.project_expenses DROP CONSTRAINT IF EXISTS project_expenses_amount_chk;
ALTER TABLE caderh.project_donations DROP CONSTRAINT IF EXISTS project_donations_amount_chk;
ALTER TABLE caderh.project_financing_sources DROP CONSTRAINT IF EXISTS project_financing_sources_amount_chk;
ALTER TABLE caderh.project_donations ALTER COLUMN disbursement_date DROP NOT NULL;
ALTER TABLE caderh.project_financing_sources ALTER COLUMN disbursement_date DROP NOT NULL;
ALTER TABLE caderh.project_expenses DROP COLUMN IF EXISTS expense_date;
