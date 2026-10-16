-- Site-content admin (03 ADM-11, ADM-13, ADM-14): projects, profile, timeline, problem of the week.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_save_project(uuid,jsonb)', 'public.admin_feature_project(uuid)',
                    'public.admin_delete_project(uuid)', 'public.admin_reorder_projects(uuid[])',
                    'public.admin_save_profile(jsonb)', 'public.admin_save_timeline(jsonb)',
                    'public.admin_save_problem(uuid,jsonb)', 'public.admin_set_current_problem(uuid,boolean)',
                    'public.admin_delete_problem(uuid)']) f;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1),
         ('10000000-0000-0000-0000-000000000002', 'physics', 'waves', 'Waves', 1);

-- A signed-in account that isn't the owner changes nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select public.admin_save_project(null, '{"slug":"x","name":"X","description":"d","landing_url":"https://x.example"}')$$,
                 '42501', null, 'a non-owner cannot add a project');
select throws_ok($$select public.admin_save_profile('{"name":"Mallory"}')$$, '42501', null,
                 'a non-owner cannot change the profile');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

-- ── Projects ──────────────────────────────────────────────────────────────
create temp table ids (name text primary key, id uuid) on commit drop;
insert into ids select 'quiz', public.admin_save_project(null,
  '{"slug":"quiz","name":" Quiz app ","glyph":"?","subject_id":"coding","tag":"Web","description":"Practice quizzes.",
    "platforms":["Web"," ",""],"landing_url":"https://quiz.example"}');
insert into ids select 'sim', public.admin_save_project(null,
  '{"slug":"sim","name":"Simulator","subject_id":"","description":"Physics sims.","platforms":[],"landing_url":"https://sim.example/app?x=1"}');
select results_eq($$select name, subject_id, platforms, sort from public.projects order by sort$$,
                  $$values ('Quiz app'::text, 'coding'::text, '{Web}'::text[], 1), ('Simulator', null, '{}', 2)$$,
                  'projects are added last, trimmed; an empty subject means none');

select throws_ok($$select public.admin_save_project(null, '{"slug":"bad","name":"Bad","description":"d","landing_url":"http://bad.example"}')$$,
                 '23514', null, 'an http: landing page is refused');
select throws_ok($$select public.admin_save_project(null, '{"slug":"bad","name":"Bad","description":"d","landing_url":"javascript:alert(1)"}')$$,
                 '23514', null, 'a javascript: landing page is refused');
select throws_ok($$select public.admin_save_project(null, '{"slug":"bad","name":"Bad","description":"d","landing_url":"https://user:pw@evil.example"}')$$,
                 '23514', null, 'a landing page with credentials is refused');

select lives_ok($$select public.admin_feature_project((select id from ids where name = 'quiz'))$$, 'feature one project');
select lives_ok($$select public.admin_feature_project((select id from ids where name = 'sim'))$$, 'feature another');
select results_eq($$select name from public.projects where is_featured$$, $$values ('Simulator'::text)$$,
                  'only one project is ever featured');
select throws_ok($$update public.projects set is_featured = true$$, '23505', null,
                 'the database refuses two featured projects');

select lives_ok($$select public.admin_reorder_projects(array[(select id from ids where name = 'sim'),
                  (select id from ids where name = 'quiz')])$$, 'reorder projects');
select results_eq($$select name, sort from public.projects order by sort$$,
                  $$values ('Simulator'::text, 1), ('Quiz app', 2)$$, 'in the new order, numbered 1..n');
select throws_ok($$select public.admin_reorder_projects(array[(select id from ids where name = 'sim')])$$, 'PT422', null,
                 'the new order must list every project');

select lives_ok($$select public.admin_save_project((select id from ids where name = 'quiz'),
                  '{"name":"Quiz","description":"New text.","landing_url":"https://quiz.example/v2"}')$$, 'edit a project');
select results_eq($$select slug, name, landing_url from public.projects where slug = 'quiz'$$,
                  $$values ('quiz'::text, 'Quiz'::text, 'https://quiz.example/v2'::text)$$, 'the slug stays');
select lives_ok($$select public.admin_delete_project((select id from ids where name = 'sim'))$$, 'delete a project');
select results_eq($$select name, sort from public.projects$$, $$values ('Quiz'::text, 1)$$, 'the order closes the gap');
select is((select action from public.audit_events order by id desc limit 1), 'project.delete', 'audited');

-- ── Profile and timeline ──────────────────────────────────────────────────
select lives_ok($$select public.admin_save_profile('{"name":"Teacher","bio":"Hi.","years":"9","students":null,"email":" "}')$$,
                'save the profile');
select results_eq($$select name, bio, years, students, email from public.profile$$,
                  $$values ('Teacher'::text, 'Hi.'::text, 9::smallint, null::integer, null::text)$$,
                  'one row; empty email and stats are not shown');
select throws_ok($$select public.admin_save_profile('{"name":"T","email":"not-an-email"}')$$, '23514', null,
                 'a malformed email is refused');
select lives_ok($$select public.admin_save_timeline('[{"year":2018,"text":"Started teaching."},{"year":2026,"text":" Launched the site. "}]')$$,
                'save the timeline');
select results_eq($$select year::int, text, sort from public.timeline_items order by sort$$,
                  $$values (2018, 'Started teaching.'::text, 1), (2026, 'Launched the site.', 2)$$,
                  'the timeline is replaced, in the order given');
select throws_ok($$select public.admin_save_timeline('[{"year":2018,"text":""}]')$$, '23514', null,
                 'an empty timeline entry is refused');

-- ── Problem of the week ───────────────────────────────────────────────────
insert into ids select 'p1', (public.admin_save_problem(null,
  '{"subject_id":"math","section_id":"10000000-0000-0000-0000-000000000001","week_of":"2026-10-12","statement":"Prove $a+b \\ge 2\\sqrt{ab}$."}') ->> 'id')::uuid;
insert into ids select 'p2', (public.admin_save_problem(null,
  '{"subject_id":"math","section_id":"","week_of":"2026-10-19","statement":"Next one.","hint":"Try n = 1."}') ->> 'id')::uuid;
select throws_ok($$select public.admin_save_problem(null, '{"subject_id":"math","section_id":"10000000-0000-0000-0000-000000000002","week_of":"2026-10-19","statement":"x"}')$$,
                 'PT422', null, 'the section must belong to the problem''s subject');

select lives_ok($$select public.admin_set_current_problem((select id from ids where name = 'p1'), true)$$, 'show one problem');
select lives_ok($$select public.admin_set_current_problem((select id from ids where name = 'p2'), true)$$, 'show the next one');
select results_eq($$select statement from public.featured_problems where is_current$$, $$values ('Next one.'::text)$$,
                  'one current problem per subject: the new one replaces the old');

select is(public.admin_save_problem((select id from ids where name = 'p2'),
            '{"subject_id":"physics","week_of":"2026-10-19","statement":"Moved."}') -> 'subjects',
          '["physics", "math"]'::jsonb, 'moving a problem reports both subjects'' pages');
select is((select is_current from public.featured_problems where statement = 'Moved.'), false,
          'and it stops being current (it was math''s)');
select is(public.admin_delete_problem((select id from ids where name = 'p1')) ->> 'was_current', 'false',
          'delete a problem');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.public_featured_problems), 0, 'visitors see no hidden problems');

select * from finish();
rollback;
