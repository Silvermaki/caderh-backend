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
    'superadmin@caderh.com',
    'a63f3c2468ff11406a18b1be075fd235425e3ae5dd20ecf7209f73aa52c2feff',
    'SUPERADMIN',
    'ADMIN',
    false
) on conflict do nothing;