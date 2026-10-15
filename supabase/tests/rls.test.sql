-- Row-level security: deny by default (03 §7, §8.4). Written before the schema (TDD).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ── Structure ─────────────────────────────────────────────────────────────
select has_table('public', 'subjects', 'subjects table exists');
select has_table('public', 'sections', 'sections table exists');
select has_table('public', 'posts', 'posts table exists');
select has_table('public', 'audit_events', 'audit_events table exists');

select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.subjects'::regclass, 'public.sections'::regclass,
                         'public.posts'::regclass, 'public.audit_events'::regclass)),
          'RLS is enabled on every public table');

select results_eq('select id from public.subjects order by sort',
                  $$values ('math'), ('physics'), ('coding'), ('it')$$,
                  'the four subjects are seeded in menu order');

-- Fixtures (as the migration owner)
insert into private.owner (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 0);
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, published_at)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'am-gm', 'math',
          '10000000-0000-0000-0000-000000000001', 'published', 'AM–GM draft edits', 'AM–GM', now()),
         ('20000000-0000-0000-0000-000000000002', 'lesson', 'secret-draft', 'math',
          '10000000-0000-0000-0000-000000000001', 'draft', 'Unpublished lesson', null, null);

-- ── Anonymous visitor ─────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is((select count(*)::int from public.subjects), 4, 'anon can read subjects');
select is((select count(*)::int from public.sections), 1, 'anon can read sections');
select is((select count(*)::int from public.posts), 1, 'anon sees published posts only');
select is((select live_title from public.posts), 'AM–GM', 'anon reads the live title');
select throws_ok('select title from public.posts', '42501', null, 'anon cannot read draft columns');
select throws_ok('select content_json from public.posts', '42501', null, 'anon cannot read draft content');
select throws_ok($$insert into public.subjects (id, name, sort) values ('art', 'Art', 9)$$, '42501', null, 'anon cannot insert subjects');
select throws_ok($$insert into public.posts (kind, slug) values ('life', 'x')$$, '42501', null, 'anon cannot insert posts');
select throws_ok($$update public.sections set title = 'hacked'$$, '42501', null, 'anon cannot update sections');
select throws_ok('delete from public.posts', '42501', null, 'anon cannot delete posts');
select throws_ok('select * from public.audit_events', '42501', null, 'anon cannot read the audit log');
select throws_ok('select * from private.owner', '42501', null, 'anon cannot see the private schema');

-- ── Signed-in user who is not the owner (even with 2FA) ───────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$insert into public.sections (subject_id, slug, title) values ('math', 'x', 'X')$$,
                 '42501', null, 'a non-owner cannot write, even with 2FA');

-- ── Owner without 2FA (aal1) ──────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$insert into public.sections (subject_id, slug, title) values ('math', 'y', 'Y')$$,
                 '42501', null, 'the owner cannot write without 2FA');

-- ── Owner with 2FA (aal2) ─────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$insert into public.sections (subject_id, slug, title) values ('math', 'sequences', 'Sequences')$$,
                'the owner with 2FA can create a section');
select lives_ok($$update public.posts set title = 'Edited draft' where slug = 'secret-draft'$$,
                'the owner with 2FA can edit a draft');
select is((select count(*)::int from public.posts), 2, 'the owner sees drafts too');
select lives_ok($$insert into public.audit_events (action, entity, entity_id) values ('test', 'post', 'x')$$,
                'the owner can append to the audit log');

select * from finish();
rollback;
