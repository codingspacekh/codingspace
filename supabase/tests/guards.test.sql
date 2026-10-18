-- Project-wide guards (code review 2026-10-18): rules every migration must keep, checked over the
-- whole schema so a new table or function can't quietly skip them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Every table visitors' API could reach has row-level security.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[], 'every table in public has row-level security');

-- A security definer function runs with its owner's rights: it must not resolve names through the
-- caller's search_path.
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by 1), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '{}'::text[], 'every security definer function pins its search_path');

-- Visitors (anon) may call only these; anything new has to be added here on purpose.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  array['ask_question', 'author_page', 'search_posts', 'search_rate_ok', 'track_time', 'track_view'],
  'anon can call only the public functions');

-- Visitors never write a table or view directly (only through those functions).
select is(
  (select coalesce(array_agg(distinct c.relname::text order by c.relname::text), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update')
           or has_table_privilege('anon', c.oid, 'delete') or has_table_privilege('anon', c.oid, 'truncate'))),
  '{}'::text[], 'anon cannot write any table or view');

-- Views read with the caller's rights, so RLS applies to them too.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  '{}'::text[], 'every view in public is security_invoker');

select * from finish();
rollback;
