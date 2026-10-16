-- Study structure (03 ADM-12): rename, describe, reorder and delete (only if empty) sections;
-- reorder lessons inside a section. Orders stay 1..n with no gaps.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

-- ── Delete ────────────────────────────────────────────────────────────────
select throws_ok($$select public.admin_delete_section('10000000-0000-0000-0000-000000000001')$$, 'PT409', null,
                 'a section with lessons cannot be deleted');
select lives_ok($$select public.admin_delete_section('10000000-0000-0000-0000-000000000003')$$, 'an empty one can');
select results_eq($$select slug, sort from public.sections where subject_id = 'math' order by sort$$,
                  $$values ('inequalities'::text, 1), ('sequences', 2)$$, 'the rest close the gap');

-- ── Not the owner ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_delete_section('10000000-0000-0000-0000-000000000002')$$, 'PT404', null,
                 'without 2FA the section is not found');

select * from finish();
rollback;
