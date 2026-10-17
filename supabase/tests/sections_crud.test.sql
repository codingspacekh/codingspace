-- Study structure (03 ADM-12): rename, describe, reorder and delete sections (with their
-- lessons); reorder lessons inside a section. Orders stay 1..n with no gaps.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_update_section(uuid,text,text)', 'public.admin_delete_section(uuid)',
                    'public.admin_reorder_sections(text,uuid[])', 'public.admin_reorder_lessons(uuid,uuid[])']) f;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1),
         ('10000000-0000-0000-0000-000000000002', 'math', 'sequences', 'Sequences', 5),
         ('10000000-0000-0000-0000-000000000003', 'math', 'empty', 'Empty', 9),
         ('10000000-0000-0000-0000-000000000004', 'physics', 'waves', 'Waves', 1);
insert into public.posts (id, kind, slug, subject_id, section_id, sort, title)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'a', 'math', '10000000-0000-0000-0000-000000000001', 0, 'A'),
         ('20000000-0000-0000-0000-000000000002', 'lesson', 'b', 'math', '10000000-0000-0000-0000-000000000001', 3, 'B'),
         ('20000000-0000-0000-0000-000000000003', 'lesson', 'c', 'math', '10000000-0000-0000-0000-000000000001', 7, 'C'),
         ('20000000-0000-0000-0000-000000000004', 'lesson', 'd', 'math', '10000000-0000-0000-0000-000000000002', 1, 'D');
-- E is live in Waves but its draft was taken out of it (not re-published); F was unpublished,
-- then moved from Empty to Sequences.
insert into public.posts (id, kind, slug, subject_id, section_id, sort, title, status, revision, live_revision,
                          live_title, published_at,
                          live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000005', 'lesson', 'e', 'physics', null, 1, 'E', 'published', 1, 1,
          'E', now(), 'physics', '10000000-0000-0000-0000-000000000004', 1, 5, 0, 'en'),
         ('20000000-0000-0000-0000-000000000006', 'lesson', 'f', 'math', '10000000-0000-0000-0000-000000000002', 2, 'F', 'draft', 1, 1,
          'F', now(), 'math', '10000000-0000-0000-0000-000000000003', 1, 5, 0, 'en');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

-- ── Rename and describe ───────────────────────────────────────────────────
select lives_ok($$select public.admin_update_section('10000000-0000-0000-0000-000000000001', 'Classical inequalities', 'AM–GM and friends')$$,
                'rename and describe a section');
select results_eq($$select slug, title, description from public.sections where id = '10000000-0000-0000-0000-000000000001'$$,
                  $$values ('inequalities'::text, 'Classical inequalities'::text, 'AM–GM and friends'::text)$$,
                  'the address (slug) stays, so links keep working');
select throws_ok($$select public.admin_update_section('10000000-0000-0000-0000-000000000001', '  ', '')$$, '23514', null,
                 'a title is required');
select is((select action from public.audit_events order by id desc limit 1), 'section.update', 'audited');

-- ── Reorder sections ──────────────────────────────────────────────────────
select lives_ok($$select public.admin_reorder_sections('math', array['10000000-0000-0000-0000-000000000003',
                  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002']::uuid[])$$,
                'reorder a subject''s sections');
select results_eq($$select slug, sort from public.sections where subject_id = 'math' order by sort$$,
                  $$values ('empty'::text, 1), ('inequalities', 2), ('sequences', 3)$$, 'in the new order, numbered 1..n');
select throws_ok($$select public.admin_reorder_sections('math', array['10000000-0000-0000-0000-000000000001',
                   '10000000-0000-0000-0000-000000000002']::uuid[])$$, 'PT422', null,
                 'the new order must list every section of the subject, once');
select throws_ok($$select public.admin_reorder_sections('math', array['10000000-0000-0000-0000-000000000003',
                   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004']::uuid[])$$, 'PT422', null,
                 'and only that subject''s sections');

-- ── Reorder lessons ───────────────────────────────────────────────────────
select lives_ok($$select public.admin_reorder_lessons('10000000-0000-0000-0000-000000000001', array[
                  '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003',
                  '20000000-0000-0000-0000-000000000001']::uuid[])$$, 'reorder a section''s lessons');
select results_eq($$select slug, sort from public.posts where section_id = '10000000-0000-0000-0000-000000000001' order by sort$$,
                  $$values ('b'::text, 1), ('c', 2), ('a', 3)$$, 'lessons in the new order, numbered 1..n');
select throws_ok($$select public.admin_reorder_lessons('10000000-0000-0000-0000-000000000001', array[
                   '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004']::uuid[])$$, 'PT422', null,
                 'the order must list exactly the section''s lessons');
select is((select action from public.audit_events order by id desc limit 1), 'section.reorder_lessons', 'audited');

-- ── Delete (with its lessons) ─────────────────────────────────────────────
select is(public.admin_delete_section('10000000-0000-0000-0000-000000000001') -> 'lessons',
          '[{"slug": "b", "kind": "lesson", "subject": null, "section": null, "was_published": false},
            {"slug": "c", "kind": "lesson", "subject": null, "section": null, "was_published": false},
            {"slug": "a", "kind": "lesson", "subject": null, "section": null, "was_published": false}]'::jsonb,
          'a section with lessons is deleted, and says which lessons went with it');
select is((select count(*)::int from public.posts where slug in ('a', 'b', 'c')), 0, 'its lessons are gone');
select is((select count(*)::int from public.audit_events where action = 'post.delete' and meta ->> 'with_section' = 'inequalities'),
          3, 'each lesson is audited');
select is((select meta ->> 'lessons' from public.audit_events where action = 'section.delete' order by id desc limit 1),
          '3', 'and the section, with how many lessons');
select is((select count(*)::int from public.posts where slug in ('d', 'f')), 2, 'other sections keep theirs');
select lives_ok($$select public.admin_delete_section('10000000-0000-0000-0000-000000000003')$$,
                'an empty one can be deleted, even if a moved, unpublished lesson was once live in it');
select is((select live_section_id from public.posts where slug = 'f'), null, 'that lesson forgets it');
select results_eq($$select slug, sort from public.sections where subject_id = 'math' order by sort$$,
                  $$values ('sequences'::text, 1)$$, 'the rest close the gap');
select throws_ok($$select public.admin_delete_section('10000000-0000-0000-0000-000000000004')$$, 'PT409', null,
                 'a lesson live here but moved elsewhere (not re-published) blocks the delete');
select is((select count(*)::int from public.posts where slug = 'e'), 1, 'and nothing was deleted');

-- ── Not the owner ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_delete_section('10000000-0000-0000-0000-000000000002')$$, 'PT404', null,
                 'without 2FA the section is not found');

select * from finish();
rollback;
