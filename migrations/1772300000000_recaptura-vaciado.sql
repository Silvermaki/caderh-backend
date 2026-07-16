-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- RECAPTURA DESDE CERO (solicitud de CADERH, correo de Victor López 09/07/2026):
-- vaciar fuentes de financiamiento, proyectos, estudiantes y procesos educativos
-- para recapturar un proyecto completo y verificar toda la reportería en cero.
--
-- ⚠ IRREVERSIBLE: ejecutar SOLO después de tomar el respaldo completo de la BD
--   (pg_dump). El respaldo NO forma parte de las migraciones a propósito.
--
-- El vaciado incluye a TODOS los dependientes por FK de las 4 entidades pedidas
-- (grafo verificado contra pg_constraint):
--   · estudiantes  → proceso_matriculas, egresados, estudiante_areas,
--                    estudiante_fotos, estudiante_huellas, estudiante_jornadas,
--                    excusa_asistencias, proceso_evaluacions, proceso_incidencias
--   · procesos     → proceso_matriculas, proceso_evaluacions, proceso_incidencias,
--                    excusa_asistencias, caderh.projects_processes
--   · projects     → project_financing_sources, project_donations,
--                    project_expenses, project_files, project_logs,
--                    project_beneficiaries, projects_agents, projects_processes
--   · financing_sources → project_financing_sources
--
-- NO se tocan: centros.centros, cursos, areas, instructores ni catálogos
-- (mejorarlos implica transformar data poblada — procedimiento posterior),
-- ni caderh.users, user_logs, expense_categories.
--
-- RESTART IDENTITY: los correlativos seriales del SGC arrancan de 1 para la
-- recaptura (las tablas caderh usan UUID, no les afecta).
-- ─────────────────────────────────────────────────────────────────────────────

TRUNCATE TABLE
  -- caderh: hijos de projects / financing_sources
  caderh.project_expenses,
  caderh.project_donations,
  caderh.project_financing_sources,
  caderh.project_files,
  caderh.project_logs,
  caderh.project_beneficiaries,
  caderh.projects_agents,
  caderh.projects_processes,
  caderh.projects,
  caderh.financing_sources,
  -- centros: hijos de estudiantes / procesos
  centros.egresados,
  centros.proceso_evaluacions,
  centros.proceso_incidencias,
  centros.excusa_asistencias,
  centros.estudiante_areas,
  centros.estudiante_fotos,
  centros.estudiante_huellas,
  centros.estudiante_jornadas,
  centros.proceso_matriculas,
  centros.procesos,
  centros.estudiantes
RESTART IDENTITY;

-- Down Migration
-- Irreversible: los datos vaciados solo se recuperan restaurando el respaldo
-- (pg_restore) tomado antes de ejecutar esta migración.
