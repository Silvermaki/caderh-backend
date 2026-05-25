-- Up Migration

-- Item 1: Add disbursement_date to financing sources and donations
ALTER TABLE caderh.project_financing_sources
  ADD COLUMN IF NOT EXISTS disbursement_date DATE;

ALTER TABLE caderh.project_donations
  ADD COLUMN IF NOT EXISTS disbursement_date DATE;

-- Item 2: Split donor / description on project_donations.
-- The legacy `description` column has been used as "Donante / Descripción"
-- (mixed donor + free text). We add `donor_name` as the required column and
-- backfill it from the legacy description.
ALTER TABLE caderh.project_donations
  ADD COLUMN IF NOT EXISTS donor_name TEXT;

UPDATE caderh.project_donations
  SET donor_name = COALESCE(NULLIF(TRIM(description), ''), 'Sin especificar'),
      description = ''
  WHERE donor_name IS NULL;

ALTER TABLE caderh.project_donations
  ALTER COLUMN donor_name SET NOT NULL;

ALTER TABLE caderh.project_donations
  ALTER COLUMN donor_name SET DEFAULT '';

-- Down Migration
-- ALTER TABLE caderh.project_donations DROP COLUMN IF EXISTS donor_name;
-- ALTER TABLE caderh.project_donations DROP COLUMN IF EXISTS disbursement_date;
-- ALTER TABLE caderh.project_financing_sources DROP COLUMN IF EXISTS disbursement_date;
