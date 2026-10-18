-- Owner analytics (v1.1, NFR-PRIV-1): cookie-less page views, salted daily visitor hashes,
-- reading time, 90-day retention with daily totals kept, owner-only reads.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select ok(not has_function_privilege('anon', 'public.admin_analytics(integer)', 'execute'), 'anon cannot read analytics');
select ok(not has_table_privilege('anon', 'private.page_views', 'select'), 'anon cannot read page views');

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1);
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, published_at, live_revision,
                          live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'am-gm', 'math', '10000000-0000-0000-0000-000000000001',
          'published', 'AM-GM', 'The AM-GM inequality', now(), 1, 'math', '10000000-0000-0000-0000-000000000001',
          1, 5, 0, 'en');

-- Old data, as if the site had run for a while: a view 100 days ago, one yesterday, and their salts.
insert into private.page_views (id, day, visitor, path, device, seconds)
  values ('30000000-0000-0000-0000-000000000001', private.analytics_today() - 100, repeat('1', 64), '/', 'desktop', 10),
         ('30000000-0000-0000-0000-000000000002', private.analytics_today() - 1, repeat('2', 64), '/', 'mobile', 40),
         ('30000000-0000-0000-0000-000000000003', private.analytics_today() - 1, repeat('2', 64), '/author', 'mobile', 0);
insert into private.analytics_salts (day) values (private.analytics_today() - 1);
delete from private.analytics_salts where day = private.analytics_today();

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(public.track_view('40000000-0000-0000-0000-000000000001', repeat('a', 64), '/posts/am-gm', 'Google', 'mobile', 'KH'),
          true, 'a visitor records a page view');

reset role;
select is((select count(*)::int from private.page_views where day < private.analytics_today() - 89), 0,
          'the first view of a day deletes views older than 90 days');
select is((select views from private.analytics_days where day = private.analytics_today() - 1), 2,
          'and keeps yesterday''s totals');
select is((select row(visitors, seconds, timed)::text from private.analytics_days where day = private.analytics_today() - 1),
          '(1,40,1)', 'visitors, seconds and timed views too');
select is((select count(*)::int from private.analytics_salts), 1, 'only today''s salt is left');
select isnt((select visitor from private.page_views where id = '40000000-0000-0000-0000-000000000001'), repeat('a', 64),
            'the stored visitor is salted again, not the server''s hash');

set local role anon;
select is(public.track_view('40000000-0000-0000-0000-000000000002', repeat('a', 64), '/', null, 'mobile', 'KH'),
          true, 'a second page from the same visitor');
select is(public.track_view('40000000-0000-0000-0000-000000000002', repeat('a', 64), '/', null, 'mobile', 'KH'),
          false, 'the same view id counts once');
select is(public.track_view('40000000-0000-0000-0000-000000000003', repeat('b', 64), '/study/math', 'facebook.example', 'desktop', null),
          true, 'another visitor');
select is(public.track_view(gen_random_uuid(), 'not-a-hash', '/', null, 'mobile', null), false, 'a bad visitor hash is refused');
select is(public.track_view(gen_random_uuid(), repeat('a', 64), '/admin/../x', null, 'mobile', null), false, 'a bad path is refused');
select is(public.track_view(gen_random_uuid(), repeat('a', 64), '/', null, 'fridge', null), false, 'an unknown device is refused');
select is(public.track_view(gen_random_uuid(), repeat('a', 64), '/', null, 'mobile', 'kh'), false, 'a bad country is refused');
select is(public.track_view(gen_random_uuid(), repeat('a', 64), '/', repeat('x', 101), 'mobile', null), false, 'a long source is refused');

select public.track_time('40000000-0000-0000-0000-000000000001', 95);
select public.track_time('40000000-0000-0000-0000-000000000001', 30);
select public.track_time('40000000-0000-0000-0000-000000000002', 99999);

reset role;
select is((select seconds from private.page_views where id = '40000000-0000-0000-0000-000000000001'), 95,
          'reading time only goes up');
select is((select seconds from private.page_views where id = '40000000-0000-0000-0000-000000000002'), 1800,
          'and stops at 30 minutes');
select is((select count(distinct visitor)::int from private.page_views where day = private.analytics_today()), 2,
          'one visitor hash per visitor per day');

-- 300 views a day per visitor.
set local role anon;
select public.track_view(gen_random_uuid(), repeat('c', 64), '/', null, 'desktop', null) from generate_series(1, 300);
select is(public.track_view(gen_random_uuid(), repeat('c', 64), '/', null, 'desktop', null), false,
          'the 301st view of a day from one visitor is refused');
reset role;
delete from private.page_views where day = private.analytics_today() and path = '/' and device = 'desktop';

-- A signed-in account that isn't the owner sees nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select is((public.admin_analytics(7) -> 'previous' ->> 'views')::int, 0, 'a non-owner reads no views');
select is(jsonb_array_length(public.admin_analytics(7) -> 'pages'), 0, 'and no pages');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
create temp table a on commit drop as select public.admin_analytics(7) as j;
select is(jsonb_array_length((select j -> 'days' from a)), 7, 'one entry per day of the range');
select is((select j -> 'days' -> 6 from a), jsonb_build_object('day', private.analytics_today(), 'views', 3, 'visitors', 2,
          'seconds', 1895, 'timed', 2), 'today''s totals come last');
select is((select (j -> 'days' -> 5 ->> 'views')::int from a), 2, 'yesterday is in the range');
select is((select j -> 'pages' -> 0 from a),
          '{"path": "/", "title": null, "subject": null, "views": 2, "visitors": 2, "seconds": 1840, "timed": 2}'::jsonb,
          'top page first, with visitors and reading time');
select is((select e ->> 'title' from a, jsonb_array_elements(j -> 'pages') e where e ->> 'path' = '/posts/am-gm'),
          'The AM-GM inequality', 'lessons carry their title');
select is((select j -> 'subjects' from a), '[{"subject": "math", "views": 2}]'::jsonb,
          'a subject counts its lessons and its subject page');
select is((select j -> 'sources' from a),
          '[{"source": null, "views": 3}, {"source": "facebook.example", "views": 1}, {"source": "Google", "views": 1}]'::jsonb,
          'sources, direct visits as null');

select * from finish();
rollback;
