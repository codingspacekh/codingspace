-- The activity log with each item's current name (03 ADM-15), in one read: owner only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_view('public', 'admin_activity_events', 'admin_activity_events view exists');

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1);
insert into public.posts (id, kind, slug, title)
  values ('20000000-0000-0000-0000-000000000001', 'life', 'renamed', 'Renamed post'),
         ('20000000-0000-0000-0000-000000000002', 'life', 'untitled', '');
insert into public.media (id, kind, mime, bytes, sha256, width, height, widths, alt, original_name)
  values ('30000000-0000-0000-0000-000000000001', 'file', 'application/pdf', 10, repeat('a', 64), null, null,
          '{}', '', 'worksheet.pdf');
insert into public.projects (id, slug, name, description, landing_url)
  values ('40000000-0000-0000-0000-000000000001', 'orbit', 'Orbit', 'A game', 'https://example.com');
insert into public.audit_events (action, entity, entity_id, meta) values
  ('post.create', 'post', '20000000-0000-0000-0000-000000000001', '{}'),
  ('post.create', 'post', '20000000-0000-0000-0000-000000000002', '{}'),
  ('post.delete', 'post', '20000000-0000-0000-0000-000000000009', '{"title":"Gone"}'),
  ('section.create', 'section', '10000000-0000-0000-0000-000000000001', '{}'),
  ('media.add', 'media', '30000000-0000-0000-0000-000000000001', '{}'),
  ('project.create', 'project', '40000000-0000-0000-0000-000000000001', '{}'),
  ('auth.sign_in', 'session', 'self', '{}');

-- ── Visitors and other accounts see nothing ───────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.admin_activity_events', '42501', null, 'anon cannot read it');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::int from public.admin_activity_events), 0, 'a non-owner sees no events');

-- ── The owner ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$select entity, name from public.admin_activity_events where entity in ('section', 'media', 'project') order by id$$,
  $$values ('section'::text, 'Inequalities'::text), ('media', 'worksheet.pdf'), ('project', 'Orbit')$$,
  'sections, files and projects carry their current name');
select is((select name from public.admin_activity_events
           where entity_id = '20000000-0000-0000-0000-000000000001'), 'Renamed post', 'a post carries its title');
select is((select name from public.admin_activity_events
           where entity_id = '20000000-0000-0000-0000-000000000002'), null, 'an empty title is no name');
select is((select name from public.admin_activity_events where action = 'post.delete'), null,
          'a deleted item has no name (the event keeps the old one in meta)');
select is((select name from public.admin_activity_events where entity = 'session'), null,
          'events about no item have no name');

select * from finish();
rollback;
