drop table if exists caderh.user_logs;

create table if not exists caderh.user_logs (
    id UUID DEFAULT gen_random_uuid() primary key,
    user_id UUID not null,
    log text not null,
    created_dt timestamp not null default now()::timestamp,
    constraint fk_logs_to_user FOREIGN KEY(user_id) REFERENCES caderh.users(id)
)