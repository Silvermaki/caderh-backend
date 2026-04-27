-- Up Migration
ALTER TABLE caderh.expense_categories
  ADD COLUMN IF NOT EXISTS is_overhead BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS expense_categories_is_overhead_idx
  ON caderh.expense_categories (is_overhead);

-- Down Migration
-- DROP INDEX IF EXISTS caderh.expense_categories_is_overhead_idx;
-- ALTER TABLE caderh.expense_categories DROP COLUMN IF EXISTS is_overhead;
