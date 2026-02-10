drop type if exists caderh.project_status;
create type caderh.project_status as enum('ACTIVE', 'DELETED', 'ARCHIVED');

alter table caderh.projects
add column project_status caderh.project_status NOT NULL DEFAULT 'ACTIVE';
