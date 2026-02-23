-- Tabla pivote para relacion muchos-a-muchos entre Proyectos y Procesos Educativos
CREATE TABLE caderh.projects_processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES caderh.projects(id) ON DELETE CASCADE,
    process_id INTEGER NOT NULL REFERENCES centros.procesos(id) ON DELETE CASCADE,
    UNIQUE(project_id, process_id)
);
