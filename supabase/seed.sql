-- Local and CI databases only (`supabase start` / `db reset`); never pushed to staging or production.
-- The test owner for the admin tests. tests/support/admin-users.ts creates the matching auth user.
-- On a real project the owner is added once by hand: see README "Admin owner".
insert into private.owner (user_id) values ('c0de0000-0000-4000-8000-0000000000a1') on conflict do nothing;
