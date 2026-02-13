-- 1) Agregar BENEFIT al enum donation_type
ALTER TYPE caderh.donation_type ADD VALUE IF NOT EXISTS 'BENEFIT';

-- 2) Enum y columna para categoria de proyecto
CREATE TYPE caderh.project_category AS ENUM('PROJECT', 'AGREEMENT');

ALTER TABLE caderh.projects
ADD COLUMN IF NOT EXISTS project_category caderh.project_category NOT NULL DEFAULT 'PROJECT';

-- 3) Tabla de categorias de gastos
CREATE TABLE IF NOT EXISTS caderh.expense_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_dt TIMESTAMP NOT NULL DEFAULT now()::timestamp
);

-- 4) FK en project_expenses hacia expense_categories
ALTER TABLE caderh.project_expenses
ADD COLUMN IF NOT EXISTS expense_category_id UUID REFERENCES caderh.expense_categories(id);
