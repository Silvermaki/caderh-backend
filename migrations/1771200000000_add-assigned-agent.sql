-- Add assigned_agent_id column to projects table
ALTER TABLE caderh.projects
ADD COLUMN assigned_agent_id UUID NULL
REFERENCES caderh.users(id) ON DELETE SET NULL;
