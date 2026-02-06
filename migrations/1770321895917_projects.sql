
drop table if exists caderh.project_financing_sources;
drop table if exists caderh.project_beneficiaries;
drop table if exists caderh.project_donations;
drop table if exists caderh.project_expenses;
drop table if exists caderh.project_files;
drop table if exists caderh.project_logs;
drop table if exists caderh.projects;
drop table if exists caderh.financing_sources;

drop type if exists caderh.donation_type;
create type caderh.donation_type as enum('CASH', 'SUPPLY');

drop type if exists caderh.beneficiary_type;
create type caderh.beneficiary_type as enum('NATURAL_PERSON', 'JURIDICAL_PERSON');

drop type if exists caderh.beneficiary_gender;
create type caderh.beneficiary_gender as enum('MALE', 'FEMALE', 'OTHER');

create table if not exists caderh.financing_sources (
    id UUID DEFAULT gen_random_uuid() primary key,
    name text not null,
    description text not null,
    created_dt timestamp not null default now()::timestamp
);

create table if not exists caderh.projects (
    id UUID DEFAULT gen_random_uuid() primary key,
    name text not null,
    description text not null,
    objectives text not null,
    start_date date not null,
    end_date date not null,
    accomplishments json not null default '[]',
    created_dt timestamp not null default now()::timestamp
);

create table if not exists caderh.project_financing_sources (
    id UUID DEFAULT gen_random_uuid() primary key,
    financing_source_id UUID not null,
    project_id UUID not null,
    amount bigint not null default 0,
    description text not null default '',
    created_dt timestamp not null default now()::timestamp,
    constraint fk_project_financing_sources_to_financing_sources FOREIGN KEY(financing_source_id) REFERENCES caderh.financing_sources(id),
    constraint fk_project_financing_sources_to_projects FOREIGN KEY(project_id) REFERENCES caderh.projects(id)
);

create table if not exists caderh.project_donations (
    id UUID DEFAULT gen_random_uuid() primary key,
    project_id UUID not null,
    amount bigint not null default 0,
    description text not null default '',
    donation_type caderh.donation_type not null,
    created_dt timestamp not null default now()::timestamp,
    constraint fk_project_donations_to_projects FOREIGN KEY(project_id) REFERENCES caderh.projects(id)
);

create table if not exists caderh.project_expenses (
    id UUID DEFAULT gen_random_uuid() primary key,
    project_id UUID not null,
    amount bigint not null default 0,
    description text not null default '',
    created_dt timestamp not null default now()::timestamp,
    constraint fk_project_expenses_to_projects FOREIGN KEY(project_id) REFERENCES caderh.projects(id)
);

create table if not exists caderh.project_beneficiaries (
    id UUID DEFAULT gen_random_uuid() primary key,
    project_id UUID not null,
    beneficiary_type caderh.beneficiary_type not null,
    identifier text not null,
    name text,
    legal_name text,
    gender caderh.beneficiary_gender,
    description text,
    phone text,
    email text,
    address text,
    created_dt timestamp not null default now()::timestamp,
    constraint fk_project_beneficiaries_to_projects FOREIGN KEY(project_id) REFERENCES caderh.projects(id)
);

create table if not exists caderh.project_files (
    id UUID DEFAULT gen_random_uuid() primary key,
    project_id UUID not null,
    file text not null,
    description text not null,
    created_dt timestamp not null default now()::timestamp,
    constraint fk_project_files_to_projects FOREIGN KEY(project_id) REFERENCES caderh.projects(id)
);

create table if not exists caderh.project_logs (
    id UUID DEFAULT gen_random_uuid() primary key,
    user_id UUID not null,
    project_id UUID not null,
    log text not null,
    created_dt timestamp not null default now()::timestamp,
    constraint fk_project_logs_to_user FOREIGN KEY(user_id) REFERENCES caderh.users(id),
    constraint fk_project_logs_to_projects FOREIGN KEY(project_id) REFERENCES caderh.projects(id)
);