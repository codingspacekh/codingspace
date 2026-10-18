-- Lesson series across subjects (v1.1, FR-03): owner-only changes, only lessons, published-only reads.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_save_series(uuid,jsonb)', 'public.admin_delete_series(uuid)',
                    'public.admin_reorder_series(uuid[])']) f;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'vectors', 'Vectors', 1),
         ('10000000-0000-0000-0000-000000000002', 'physics', 'mechanics', 'Mechanics', 1);
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, published_at, live_revision,
                          live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'vectors-intro', 'math', '10000000-0000-0000-0000-000000000001',
          'published', 'Vectors', 'Vectors', now(), 1, 'math', '10000000-0000-0000-0000-000000000001', 1, 5, 0, 'en'),
         ('20000000-0000-0000-0000-000000000003', 'lesson', 'forces', 'physics', '10000000-0000-0000-0000-000000000002',
          'published', 'Forces', 'Forces', now(), 1, 'physics', '10000000-0000-0000-0000-000000000002', 1, 5, 0, 'en');
insert into public.posts (id, kind, slug, subject_id, section_id, status, title)
  values ('20000000-0000-0000-0000-000000000002', 'lesson', 'draft-lesson', 'math',
          '10000000-0000-0000-0000-000000000001', 'draft', 'Secret draft');
insert into public.posts (id, kind, slug, status, title, live_title, published_at, live_revision, live_level,
                          live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000004', 'life', 'a-life-post', 'published', 'Life', 'Life', now(), 1, 1, 3, 0, 'en');

-- A signed-in account that isn't the owner changes nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select public.admin_save_series(null, '{"slug":"x","title":"X","post_ids":[]}')$$,
                 '42501', null, 'a non-owner cannot add a series');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
create temp table ids (name text primary key, id uuid) on commit drop;
insert into ids select 'mfp', public.admin_save_series(null,
  '{"slug":"maths-for-physics","title":" Maths for Physics ","description":"Tools first.",
    "post_ids":["20000000-0000-0000-0000-000000000001","20000000-0000-0000-0000-000000000002","20000000-0000-0000-0000-000000000003"]}');
select is((select title from public.series where id = (select id from ids)), 'Maths for Physics', 'the title is trimmed');
select results_eq($$select post_id::text from public.series_lessons order by position$$,
  $$values ('20000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002'),
           ('20000000-0000-0000-0000-000000000003')$$, 'lessons from two subjects, in the given order');
select is((select action from public.audit_events order by id desc limit 1), 'series.create', 'creating is audited');

select throws_ok($$select public.admin_save_series(null, '{"slug":"x","title":"X","post_ids":["20000000-0000-0000-0000-000000000004"]}')$$,
                 'PT422', 'only lessons can be in a series', 'a life post is refused');
select throws_ok($$select public.admin_save_series(null, '{"slug":"x","title":"X","post_ids":["20000000-0000-0000-0000-000000000001","20000000-0000-0000-0000-000000000001"]}')$$,
                 'PT422', 'a lesson can be in a series only once', 'a repeated lesson is refused');
select throws_ok($$select public.admin_save_series(null, '{"slug":"x","title":"X","post_ids":["20000000-0000-0000-0000-0000000000ff"]}')$$,
                 'PT422', null, 'a lesson that does not exist is refused');
select throws_ok($$select public.admin_save_series(null, '{"slug":"x","title":"X"}')$$,
                 'PT422', 'post_ids must be a list', 'the lesson list is required');
select throws_ok($$select public.admin_save_series(null, '{"slug":"maths-for-physics","title":"Again","post_ids":[]}')$$,
                 '23505', null, 'slugs are unique');
select throws_ok($$select public.admin_save_series('30000000-0000-0000-0000-000000000000', '{"title":"Gone","post_ids":[]}')$$,
                 'PT404', 'series not found', 'editing a missing series is a 404');

-- Edit: new title and order; the slug stays.
select public.admin_save_series((select id from ids), '{"slug":"ignored","title":"Maths for Physics","description":"",
  "post_ids":["20000000-0000-0000-0000-000000000003","20000000-0000-0000-0000-000000000001"]}');
select is((select slug from public.series where id = (select id from ids)), 'maths-for-physics', 'editing keeps the slug');
select results_eq($$select post_id::text from public.series_lessons order by position$$,
  $$values ('20000000-0000-0000-0000-000000000003'), ('20000000-0000-0000-0000-000000000001')$$, 'the lessons are replaced');
select is((select name from public.admin_activity_events where action = 'series.update' limit 1), 'Maths for Physics',
          'the activity log names the series');

insert into ids select 'p1', public.admin_save_series(null,
  '{"slug":"paper-1","title":"9618 Paper 1","post_ids":["20000000-0000-0000-0000-000000000002","20000000-0000-0000-0000-000000000001"]}');
select public.admin_reorder_series(array[(select id from ids where name = 'p1'), (select id from ids where name = 'mfp')]);
select results_eq($$select slug from public.series order by sort$$, $$values ('paper-1'::text), ('maths-for-physics')$$,
                  'the series are reordered');
select throws_ok(format('select public.admin_reorder_series(array[%L::uuid])', (select id from ids where name = 'p1')),
                 'PT422', null, 'a reorder must list every series');

-- Visitors: published lessons only, numbered without gaps.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select l.slug, l.position from public.public_series_lessons l join public.public_series s on s.id = l.series_id
                    where s.slug = 'paper-1' order by l.position$$,
                  $$values ('vectors-intro'::text, 1)$$, 'a draft in a series is invisible and leaves no gap');
select is((select lesson_count from public.public_series where slug = 'paper-1'), 1, 'it is not counted either');
select is((select count(*)::int from public.series_lessons where post_id = '20000000-0000-0000-0000-000000000002'), 0,
          'the draft''s place in a series is not readable');
select is((select count(*)::int from public.public_series), 2, 'visitors read every series');

-- Deleting a lesson takes it out of its series; deleting a series renumbers the others.
reset role;
delete from public.posts where id = '20000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.series_lessons where series_id = (select id from ids where name = 'mfp')), 1,
          'a deleted lesson leaves its series');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select public.admin_delete_series((select id from ids where name = 'p1'));
select results_eq($$select slug, sort from public.series$$, $$values ('maths-for-physics'::text, 1)$$,
                  'deleting renumbers the rest');

select * from finish();
rollback;
