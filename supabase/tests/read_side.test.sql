-- M2 read side: public views, projects, profile, featured problems (03 §7). Written first.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- ── Structure ─────────────────────────────────────────────────────────────
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'profile', 'profile table exists');
select has_table('public', 'timeline_items', 'timeline_items table exists');
select has_table('public', 'featured_problems', 'featured_problems table exists');

select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.projects'::regclass, 'public.profile'::regclass,
                         'public.timeline_items'::regclass, 'public.featured_problems'::regclass)),
          'RLS is enabled on every new table');

select has_view('public', v, format('view %s exists', v))
  from unnest(array['public_posts', 'public_sections', 'public_projects', 'public_profile',
                    'public_timeline', 'public_featured_problems']) as v;

-- Invoker views keep RLS and column grants in force underneath the view.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'public\_%'
             and 'security_invoker=true' = any (c.reloptions)),
          6, 'every public view runs with the caller''s rights (security_invoker)');

select hasnt_column('public', 'public_posts', c, format('public_posts hides %s', c))
  from unnest(array['content_json', 'live_title', 'status', 'scheduled_at']) as c;

-- ── Constraints ───────────────────────────────────────────────────────────
select throws_ok($$insert into public.projects (slug, name, description, landing_url)
                  values ('x', 'X', 'x', 'http://example.com')$$,
                 '23514', null, 'project links must be https');
select throws_ok($$insert into public.projects (slug, name, description, landing_url)
                  values ('x', 'X', 'x', 'javascript:alert(1)')$$,
                 '23514', null, 'project links cannot be javascript: URLs');
insert into public.projects (slug, name, description, landing_url, is_featured, sort)
  values ('runner', 'Runner', 'Runs pseudocode', 'https://example.com/runner', true, 1),
         ('drills', 'Drills', 'Daily drills', 'https://example.com/drills', false, 2);
select throws_ok($$insert into public.projects (slug, name, description, landing_url, is_featured)
                  values ('y', 'Y', 'y', 'https://example.com/y', true)$$,
                 '23505', null, 'only one project can be featured');

insert into public.profile (name, bio, years, students, email)
  values ('CodingSpace', 'Teacher', 8, 500, 'hello@codingspace.io');
select throws_ok($$insert into public.profile (name, bio) values ('Second', 'x')$$,
                 '23505', null, 'the profile has a single row');

insert into public.timeline_items (year, text, sort) values (2018, 'Started teaching', 1);

select throws_ok($$insert into public.posts (kind, slug, subject_id, level) values ('lesson', 'lv', 'math', 4)$$,
                 '23514', null, 'lesson level is 1–3');

-- Fixtures
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1),
         ('10000000-0000-0000-0000-000000000002', 'math', 'sequences', 'Sequences', 2);
insert into public.posts (kind, slug, subject_id, section_id, sort, level, status, title,
                          live_title, live_summary, live_html, live_search_text, published_at)
  values ('lesson', 'am-gm', 'math', '10000000-0000-0000-0000-000000000001', 1, 1, 'draft',
          'draft title', 'AM–GM', 'Means', '<p>x</p>', 'arithmetic mean geometric mean', null),
         ('lesson', 'cauchy', 'math', '10000000-0000-0000-0000-000000000001', 2, 2, 'draft',
          'draft', 'Cauchy–Schwarz', 'Sums', '<p>y</p>', 'sum of products', null),
         ('lesson', 'hidden', 'math', '10000000-0000-0000-0000-000000000001', 3, 1, 'draft',
          'Hidden draft', null, null, null, 'secret words', null),
         ('life', 'hello', null, null, 0, 1, 'draft', 'x', 'Hello', 'Hi', '<p>hi</p>', 'hello', null);
-- Published as the import does it (M3 adds live copies of the settings).
update public.posts
  set status = 'published', published_at = now(), live_revision = revision, live_subject_id = subject_id,
      live_section_id = section_id, live_level = level, live_minutes = minutes,
      live_problem_count = problem_count, live_lang = lang
  where slug in ('am-gm', 'cauchy', 'hello');

insert into public.featured_problems (subject_id, section_id, week_of, statement, hint, solution, is_current)
  values ('math', '10000000-0000-0000-0000-000000000001', '2026-10-05', 'Old problem', 'h', 's', false),
         ('math', '10000000-0000-0000-0000-000000000001', '2026-10-12', 'Prove a+b+c ≥ 3', 'AM–GM', 'By AM–GM', true);
select throws_ok($$insert into public.featured_problems (subject_id, week_of, statement, is_current)
                  values ('math', '2026-10-19', 'Another', true)$$,
                 '23505', null, 'one current problem per subject');

-- ── Anonymous visitor ─────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq('select slug from public.public_posts order by slug',
                  $$values ('am-gm'), ('cauchy'), ('hello')$$,
                  'anon sees published posts only, through public_posts');
select is((select title from public.public_posts where slug = 'am-gm'), 'AM–GM',
          'public_posts.title is the live title, not the draft');
select is((select level from public.public_posts where slug = 'cauchy'), 2::smallint,
          'public_posts exposes the level');
select results_eq($$select slug from public.public_posts
                    where search @@ plainto_tsquery('simple', 'geometric')$$,
                  $$values ('am-gm')$$, 'full-text search finds live text');
select is_empty($$select slug from public.public_posts
                  where search @@ plainto_tsquery('simple', 'secret')$$,
                'full-text search never matches drafts');

select results_eq($$select slug, lesson_count from public.public_sections
                    where subject_id = 'math' order by sort$$,
                  $$values ('inequalities'::text, 2), ('sequences'::text, 0)$$,
                  'public_sections counts published lessons only');

select results_eq('select slug from public.public_projects order by sort',
                  $$values ('runner'), ('drills')$$, 'anon reads projects in order');
select is((select name from public.public_profile), 'CodingSpace', 'anon reads the profile');
select is((select count(*)::int from public.public_timeline), 1, 'anon reads the timeline');
select results_eq('select statement from public.public_featured_problems',
                  $$values ('Prove a+b+c ≥ 3')$$, 'anon sees only the current featured problem');

select throws_ok('select * from public.posts', '42501', null, 'anon cannot select * from posts: draft columns stay hidden');
select is((select count(*)::int from public.featured_problems), 1,
          'reading featured_problems directly still shows only the current problem (RLS)');
select throws_ok($$insert into public.public_posts (slug) values ('x')$$, '42501', null, 'anon cannot write through a view');
select throws_ok($$insert into public.projects (slug, name, description, landing_url)
                  values ('z', 'Z', 'z', 'https://example.com/z')$$, '42501', null, 'anon cannot insert projects');
select throws_ok($$update public.profile set bio = 'hacked'$$, '42501', null, 'anon cannot update the profile');
select throws_ok('delete from public.timeline_items', '42501', null, 'anon cannot delete timeline items');
select throws_ok($$insert into public.featured_problems (subject_id, week_of, statement)
                  values ('math', '2026-10-26', 'x')$$, '42501', null, 'anon cannot insert featured problems');

-- ── Signed-in non-owner, and owner without 2FA ────────────────────────────
reset role;
insert into private.owner (user_id) values ('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$insert into public.projects (slug, name, description, landing_url)
                  values ('n', 'N', 'n', 'https://example.com/n')$$,
                 '42501', null, 'a non-owner cannot add projects');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$insert into public.timeline_items (year, text) values (2020, 'x')$$, '42501', null,
                 'the owner cannot write without 2FA');

-- ── Owner with 2FA ────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$insert into public.projects (slug, name, description, landing_url)
                  values ('o', 'O', 'o', 'https://example.com/o')$$, 'the owner with 2FA can add projects');
select lives_ok($$update public.profile set bio = 'Updated'$$, 'the owner with 2FA can edit the profile');
select lives_ok($$insert into public.featured_problems (subject_id, week_of, statement)
                  values ('physics', '2026-10-12', 'A ball is thrown…')$$,
                'the owner with 2FA can add featured problems');

select * from finish();
rollback;
