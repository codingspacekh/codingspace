-- Sign-in throttling (code review 2026-10-18): failures counted per visitor key, service role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select ok(not has_function_privilege(r, f, 'execute'), format('%s cannot call %s', r, f))
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.auth_failures_recent(text,integer)', 'public.auth_record_failure(text)']) f;
select ok(has_function_privilege('service_role', 'public.auth_record_failure(text)', 'execute'),
          'the server (service role) can record failures');

select is(public.auth_failures_recent(repeat('a', 64)), 0, 'a new visitor has no failures');
select is(public.auth_record_failure(repeat('a', 64)), 1, 'one failure');
select is(public.auth_record_failure(repeat('a', 64)), 2, 'two, in the same minute');
select is(public.auth_failures_recent(repeat('b', 64)), 0, 'another visitor is counted apart');

-- Older failures leave the window (and old rows are deleted).
insert into private.auth_failures (key, minute, failures)
  values (repeat('c', 64), date_trunc('minute', now()) - interval '20 minutes', 9),
         (repeat('c', 64), date_trunc('minute', now()) - interval '2 days', 50);
select is(public.auth_record_failure(repeat('c', 64)), 1, 'only the last 15 minutes count');
select is((select count(*)::int from private.auth_failures where key = repeat('c', 64)), 2,
          'rows older than a day are deleted');

select * from finish();
rollback;
