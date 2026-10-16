-- Admin session checks (03 ADM-01, §8.3): owner + 2FA, session not revoked, 12 h idle timeout.
-- public.admin_touch() is what every admin API request calls before doing anything else.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_function('public', 'admin_touch', array[]::text[], 'admin_touch() exists');
select is((select prosecdef from pg_proc where oid = 'public.admin_touch()'::regprocedure), true,
          'admin_touch() runs as its owner (it reads auth.sessions)');
select ok(not has_function_privilege('anon', 'public.admin_touch()', 'execute'), 'anon cannot call admin_touch()');
select ok(not has_table_privilege('authenticated', 'private.admin_activity', 'select'),
          'signed-in users cannot read the activity table directly');

-- Fixtures: the owner (two sessions) and another user (one session).
insert into auth.users (id, email, aud, role)
  values ('00000000-0000-0000-0000-0000000000a1', 'owner@example.test', 'authenticated', 'authenticated'),
         ('00000000-0000-0000-0000-0000000000b1', 'other@example.test', 'authenticated', 'authenticated');
insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into auth.sessions (id, user_id, created_at, aal)
  values ('5e550000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', now(), 'aal2'),
         ('5e550000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', now() - interval '13 hours', 'aal2'),
         ('5e550000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1', now(), 'aal2');

set local role authenticated;

-- ── Who may pass ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select is(public.admin_touch(), 'forbidden', 'the owner without 2FA is forbidden');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal2","session_id":"5e550000-0000-0000-0000-000000000003"}', true);
select is(public.admin_touch(), 'forbidden', 'another user with 2FA is forbidden');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select is(public.admin_touch(), 'ok', 'the owner with 2FA and a live session passes');
select is(public.admin_touch(), 'ok', 'and passes again (activity refreshed)');

-- ── Revoked sessions ("sign out everywhere" deletes them) ────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2","session_id":"5e550000-0000-0000-0000-0000000000ff"}', true);
select is(public.admin_touch(), 'revoked', 'a token whose session no longer exists is revoked');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select is(public.admin_touch(), 'revoked', 'a token without a session id is revoked');

-- ── 12 h idle timeout ─────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2","session_id":"5e550000-0000-0000-0000-000000000002"}', true);
select is(public.admin_touch(), 'expired', 'a session with no activity for 12 h (since sign-in) has expired');

reset role;
update private.admin_activity set last_seen = now() - interval '12 hours 1 minute'
  where session_id = '5e550000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select is(public.admin_touch(), 'expired', 'a session idle for more than 12 h has expired');
select is(public.admin_touch(), 'expired', 'and stays expired: a request does not revive it');

reset role;
update private.admin_activity set last_seen = now() - interval '11 hours 59 minutes'
  where session_id = '5e550000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.admin_touch(), 'ok', 'a session idle for just under 12 h still passes');

select * from finish();
rollback;
