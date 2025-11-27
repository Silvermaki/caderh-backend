drop type if exists caderh.user_role;
create type caderh.user_role as enum('ADMIN', 'USER');

drop table if exists caderh.users;

create table if not exists caderh.users (
    id UUID DEFAULT gen_random_uuid() primary key,
    email text not null,
    name text not null,
    password text not null,
    role caderh.user_role not null default 'USER',
    created_dt timestamp not null default now()::timestamp,
    disabled boolean not null default false,
    first_login boolean not null default true,
    verification_code text
)