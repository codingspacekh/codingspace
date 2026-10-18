-- Syllabus tags (v1.1): owner-built syllabuses and points; lessons tagged with them; published-only reads.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_save_syllabus(uuid,jsonb)', 'public.admin_save_syllabus_points(uuid,jsonb)',
                    'public.admin_delete_syllabus(uuid)', 'public.admin_reorder_syllabuses(uuid[])',
                    'public.admin_set_post_syllabus(uuid,uuid[])']) f;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'coding', 'data', 'Data', 1);
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, published_at, live_revision,
                          live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'binary', 'coding', '10000000-0000-0000-0000-000000000001',
          'published', 'Binary', 'Binary', now(), 1, 'coding', '10000000-0000-0000-0000-000000000001', 1, 5, 0, 'en');
insert into public.posts (id, kind, slug, subject_id, section_id, status, title)
  values ('20000000-0000-0000-0000-000000000002', 'lesson', 'draft-hex', 'coding',
          '10000000-0000-0000-0000-000000000001', 'draft', 'Secret hex');
insert into public.posts (id, kind, slug, status, title) values ('20000000-0000-0000-0000-000000000003', 'life', 'a-life', 'draft', 'Life');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select public.admin_save_syllabus(null, '{"slug":"x","code":"X","title":"X"}')$$,
                 '42501', null, 'a non-owner cannot add a syllabus');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
create temp table ids (id uuid) on commit drop;
insert into ids select public.admin_save_syllabus(null,
  '{"slug":"9618","code":" 9618 ","title":"Computer Science 9618","subject_id":"coding"}');
select is((select code from public.syllabuses), '9618', 'a syllabus is added, trimmed');

select public.admin_save_syllabus_points((select id from ids),
  '[{"code":"1.1","title":"Data representation"},{"code":"1.2","title":"Multimedia"}]');
select results_eq($$select code, title, sort from public.syllabus_points order by sort$$,
                  $$values ('1.1'::text, 'Data representation'::text, 1), ('1.2', 'Multimedia', 2)$$, 'points in order');

-- Tag lessons; a life post or an unknown point is refused.
select public.admin_set_post_syllabus('20000000-0000-0000-0000-000000000001',
  array(select id from public.syllabus_points where code = '1.1'));
select public.admin_set_post_syllabus('20000000-0000-0000-0000-000000000002',
  array(select id from public.syllabus_points where code = '1.1'));
select throws_ok($$select public.admin_set_post_syllabus('20000000-0000-0000-0000-000000000003', '{}')$$,
                 'PT404', 'lesson not found', 'life posts are not tagged');
select throws_ok($$select public.admin_set_post_syllabus('20000000-0000-0000-0000-000000000001',
                   array['30000000-0000-0000-0000-000000000000'::uuid])$$, 'PT422', null, 'an unknown point is refused');

-- Edit the list: swap codes, rename, add, drop one. Kept points keep their id (and tags).
select public.admin_save_syllabus_points((select id from ids), (
  select jsonb_build_array(
    jsonb_build_object('id', (select id from public.syllabus_points where code = '1.2'), 'code', '1.1', 'title', 'Multimedia'),
    jsonb_build_object('id', (select id from public.syllabus_points where code = '1.1'), 'code', '1.2', 'title', 'Number systems'),
    jsonb_build_object('code', '1.3', 'title', 'Compression'))));
select results_eq($$select code, title from public.syllabus_points order by sort$$,
                  $$values ('1.1'::text, 'Multimedia'::text), ('1.2', 'Number systems'), ('1.3', 'Compression')$$,
                  'codes can swap; a point is added');
select is((select pt.title from public.post_syllabus ps join public.syllabus_points pt on pt.id = ps.point_id
            where ps.post_id = '20000000-0000-0000-0000-000000000001'), 'Number systems', 'the lesson stays tagged');
select throws_ok(format($$select public.admin_save_syllabus_points(%L, '[{"code":"1.1","title":"A"},{"code":"1.1","title":"B"}]')$$,
                        (select id from ids)), 'PT422', 'each point needs its own code', 'codes are unique');
select is((select name from public.admin_activity_events where action = 'syllabus.points' limit 1),
          'Computer Science 9618', 'the activity log names the syllabus');

-- Visitors: published lessons only.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select slug, point_code, syllabus_slug from public.public_syllabus_lessons$$,
                  $$values ('binary'::text, '1.2'::text, '9618'::text)$$, 'visitors see published lessons only');
select is((select count(*)::int from public.post_syllabus), 1, 'a draft''s tags are not readable');
select is((select count(*)::int from public.syllabus_points), 3, 'visitors read the points');
select throws_ok($$select public.admin_save_syllabus(null, '{"slug":"y","code":"Y","title":"Y"}')$$,
                 '42501', null, 'visitors cannot add syllabuses');

-- Dropping a point drops its tags; deleting the syllabus drops the rest.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select public.admin_save_syllabus_points((select id from ids), '[{"code":"2.1","title":"Hardware"}]');
select is((select count(*)::int from public.post_syllabus), 0, 'removed points take their tags with them');
select public.admin_delete_syllabus((select id from ids));
select is((select count(*)::int from public.syllabus_points), 0, 'deleting a syllabus deletes its points');

select * from finish();
rollback;
