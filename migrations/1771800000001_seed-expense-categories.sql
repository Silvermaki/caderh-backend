-- Up Migration
-- Seed initial expense_categories based on CADERH Excel samples (2023 reports)
-- Source: examples-report/Resultados Reporteria ERP 17112023 (2).xlsx
-- is_overhead: TRUE marks administrative/indirect costs retained by CADERH

INSERT INTO caderh.expense_categories (name, is_overhead)
VALUES
  ('Presupuesto Global',           FALSE),
  ('Presupuesto Anual a Ejecutar', FALSE),
  ('Desembolso a CADERH (ERP)',    FALSE),
  ('Total Desembolsado a Centros', FALSE),
  ('Estipendios para Jóvenes',     FALSE),
  ('Kit de Emprendimiento',        FALSE),
  ('Donaciones',                   FALSE),
  ('Overhead Trimestral',          TRUE)
ON CONFLICT (name) DO NOTHING;

-- Down Migration
-- DELETE FROM caderh.expense_categories WHERE name IN (
--   'Presupuesto Global', 'Presupuesto Anual a Ejecutar',
--   'Desembolso a CADERH (ERP)', 'Total Desembolsado a Centros',
--   'Estipendios para Jóvenes', 'Kit de Emprendimiento',
--   'Donaciones', 'Overhead Trimestral'
-- );
