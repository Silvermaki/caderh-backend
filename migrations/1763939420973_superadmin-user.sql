insert into
  caderh.users (
    email,
    password,
    name,
    role,
    first_login
  )
values
  (
    'superadmin@caderh.hn',
    '4bffc6266ce03bfd0059ea1e915c1f5bde31e3561aa7ba7b89d393ef5fabc0c0',
    'SUPERADMIN',
    'ADMIN',
    false
) on conflict do nothing;