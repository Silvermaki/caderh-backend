-- Tabla pivote para asignacion multiple de agentes
CREATE TABLE caderh.projects_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES caderh.projects(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES caderh.users(id) ON DELETE CASCADE,
    assigned_dt TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(project_id, agent_id)
);

-- Migrar datos existentes
INSERT INTO caderh.projects_agents (project_id, agent_id)
SELECT id, assigned_agent_id FROM caderh.projects
WHERE assigned_agent_id IS NOT NULL;

-- Eliminar columna vieja
ALTER TABLE caderh.projects DROP COLUMN assigned_agent_id;
