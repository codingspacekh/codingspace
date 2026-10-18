-- Subjects from the admin (v1.1): owner-only changes; a hidden subject and everything in it stay private.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_save_subject(text,jsonb)', 'public.admin_delete_subject(text)',
                    'public.admin_reorder_subjects(text[])']) f;
select is((select count(*)::int from public.subjects where blurb <> '' and intro <> ''), 4,
          'the four first subjects keep their copy');

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');

-- A signed-in account that isn't the owner changes nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select public.admin_save_subject(null, '{"id":"chemistry","name":"Chemistry"}')$$,
                 '42501', null, 'a non-owner cannot add a subject');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select is(public.admin_save_subject(null,
  '{"id":"chemistry","name":" Chemistry ","glyph":"⚗","color":"orange","blurb":"Atoms up.","intro":"From atoms to reactions."}'),
  'chemistry', 'the owner adds a subject');
select results_eq($$select name, visible, sort from public.subjects where id = 'chemistry'$$,
                  $$values ('Chemistry'::text, false, 4)$$, 'a new subject is trimmed, hidden and last');
select is((select action from public.audit_events order by id desc limit 1), 'subject.create', 'adding is audited');

select throws_ok($$select public.admin_save_subject(null, '{"id":"Bio-1","name":"Biology"}')$$,
                 'PT422', null, 'the address is letters only');
select throws_ok($$select public.admin_save_subject(null, '{"id":"biology","name":"Biology","color":"plaid"}')$$,
                 '23514', null, 'colours come from the palette');
select throws_ok($$select public.admin_save_subject(null, '{"id":"math","name":"Again"}')$$,
                 '23505', null, 'addresses are unique');
select throws_ok($$select public.admin_save_subject('nope', '{"name":"Gone"}')$$,
                 'PT404', 'subject not found', 'editing a missing subject is a 404');

-- Content inside the hidden subject.
reset role;
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'chemistry', 'acids', 'Acids', 1);
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, published_at, live_revision,
                          live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'titration', 'chemistry',
          '10000000-0000-0000-0000-000000000001', 'published', 'Titration', 'Titration', now(), 1, 'chemistry',
          '10000000-0000-0000-0000-000000000001', 1, 5, 0, 'en');
insert into public.featured_problems (subject_id, week_of, statement, is_current)
  values ('chemistry', '2026-11-02', 'Balance it.', true);
insert into public.projects (id, slug, name, subject_id, description, landing_url)
  values ('30000000-0000-0000-0000-000000000001', 'molecules', 'Molecules', 'chemistry', 'A 3D viewer.', 'https://example.com');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.subjects), 4, 'visitors do not see a hidden subject');
select is((select count(*)::int from public.public_sections where subject_id = 'chemistry'), 0, '…nor its sections');
select is((select count(*)::int from public.public_posts where slug = 'titration'), 0, '…nor its lessons');
select is((select count(*)::int from public.search_posts('titration')), 0, '…not even in search');
select is((select count(*)::int from public.public_featured_problems where subject_id = 'chemistry'), 0,
          '…nor its problem of the week');

-- Shown: everything appears.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select public.admin_save_subject('chemistry',
  '{"name":"Chemistry","glyph":"⚗","color":"orange","blurb":"Atoms up.","intro":"","visible":true}');
select is((select name from public.admin_activity_events where action = 'subject.update' limit 1), 'Chemistry',
          'the activity log names the subject');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.subjects), 5, 'a shown subject is public');
select is((select count(*)::int from public.public_posts where slug = 'titration'), 1, '…with its lessons');
select is((select count(*)::int from public.public_featured_problems where subject_id = 'chemistry'), 1,
          '…and its problem of the week');
select throws_ok($$select public.admin_save_subject('chemistry', '{"name":"Hacked"}')$$,
                 '42501', null, 'visitors cannot edit subjects');

-- Order and delete.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select public.admin_reorder_subjects(array['chemistry', 'math', 'physics', 'coding', 'it']);
select results_eq($$select id from public.subjects order by sort$$,
                  $$values ('chemistry'::text), ('math'), ('physics'), ('coding'), ('it')$$, 'subjects are reordered');
select throws_ok($$select public.admin_reorder_subjects(array['math'])$$, 'PT422', null,
                 'a reorder must list every subject');
select throws_ok($$select public.admin_delete_subject('chemistry')$$, 'PT409', null,
                 'a subject with sections, lessons or problems cannot be deleted');

reset role;
delete from public.featured_problems where subject_id = 'chemistry';
delete from public.posts where subject_id = 'chemistry';
delete from public.sections where subject_id = 'chemistry';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select public.admin_delete_subject('chemistry');
select results_eq($$select id, sort from public.subjects order by sort$$,
                  $$values ('math'::text, 0), ('physics', 1), ('coding', 2), ('it', 3)$$, 'an empty subject is deleted');
select is((select subject_id from public.projects where slug = 'molecules'), null, 'its projects lose the label');

select * from finish();
rollback;
