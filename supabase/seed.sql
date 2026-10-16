-- Local and CI databases only (`supabase start` / `db reset`); never pushed to staging or production.
-- Test owners for the admin tests; tests/support/admin-users.ts creates the matching auth users.
-- Two, so test files running in parallel never reset each other's authenticator.
-- On a real project the owner is added once by hand: see README "Admin owner".
insert into private.owner (user_id)
  values ('c0de0000-0000-4000-8000-0000000000a1'), ('c0de0000-0000-4000-8000-0000000000a2')
  on conflict do nothing;
