-- The Author page in sections (03 ADM-14, owner request 2026-10-17): every part can be hidden,
-- sections and items keep the owner's order, and hidden parts never reach visitors.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'author_sections', 'author_sections table exists');
select has_table('public', 'author_items', 'author_items table exists');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.author_sections'::regclass, 'public.author_items'::regclass)), 'RLS is on');
select results_eq($$select id from public.author_sections order by sort$$,
                  $$values ('timeline'::text), ('experience'), ('education'), ('skills'), ('awards'), ('hobbies'),
                           ('life_posts')$$,
                  'every database starts with the built-in sections, the timeline first and life posts last');
select ok(not has_function_privilege('anon', 'public.admin_save_author(jsonb)', 'execute'),
          'anon cannot call admin_save_author');
select ok(has_function_privilege('anon', 'public.author_page()', 'execute'), 'anon can call author_page');

-- The whole page as the admin sends it: the built-ins in this order, then `extra` sections.
create function pg_temp.page(profile jsonb, extra jsonb default '[]', skip text default null) returns jsonb
language sql as $$
  select jsonb_build_object('profile', profile, 'sections',
    coalesce((select jsonb_agg(jsonb_build_object('kind', k, 'title', initcap(k), 'visible', true, 'items', '[]'::jsonb)
                               order by n)
              from unnest(array['life_posts', 'education', 'experience', 'skills', 'awards', 'hobbies', 'timeline'])
                   with ordinality as t(k, n)
              where k is distinct from skip), '[]') || extra);
$$;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.profile (id, name, bio, years, students, email)
  values (true, 'Teacher', 'Hello.', 8, 500, 'me@example.com');

-- ── Visitors ──────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.author_sections', '42501', null, 'anon cannot read the sections table');
select throws_ok('select count(*) from public.author_items', '42501', null, 'anon cannot read the items table');
reset role;

-- A signed-in account that isn't the owner changes nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Mallory"}'))$$, '42501', null,
                 'a non-owner cannot change the Author page');
select is((select count(*)::int from public.author_items), 0, 'and sees no items');

-- ── The owner ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

create temp table saved (n int primary key, page jsonb) on commit drop;
insert into saved values (1, pg_temp.page(
  '{"name":" Teacher ","bio":"I **teach**.","years":8,"students":500,"email":"me@example.com","hidden":["email","years"]}',
  '[{"kind":"custom","title":" Languages ","visible":true,"items":[{"title":"Khmer"},{"title":"English","subtitle":"fluent"}]},
    {"kind":"custom","title":"Secret","visible":false,"items":[{"title":"Hidden list"}]}]'));
insert into saved select 2, jsonb_set(page, '{sections,1,items}',
  '[{"title":"BSc Physics","subtitle":"RUPP","period":"2012–2016","note":"With *honours*."},
    {"title":"MSc","subtitle":"Somewhere","period":"2018","visible":false}]') from saved where n = 1;
grant select on saved to authenticated, anon;

select lives_ok($$select public.admin_save_author(page) from saved where n = 1$$, 'the owner saves the page');
select lives_ok($$select public.admin_save_author(page) from saved where n = 2$$,
                'and again: a save replaces what was there');

select results_eq($$select id, title, visible, sort from public.author_sections where kind <> 'custom' order by sort$$,
                  $$values ('life_posts'::text, 'Life_posts'::text, true, 1), ('education', 'Education', true, 2),
                           ('experience', 'Experience', true, 3), ('skills', 'Skills', true, 4),
                           ('awards', 'Awards', true, 5), ('hobbies', 'Hobbies', true, 6),
                           ('timeline', 'Timeline', true, 7)$$,
                  'the built-in sections take the new order and titles');
select results_eq($$select title, visible, sort from public.author_sections where kind = 'custom' order by sort$$,
                  $$values ('Languages'::text, true, 8), ('Secret', false, 9)$$, 'custom sections are added, trimmed');
select is((select count(*)::int from public.author_sections where kind = 'custom'), 2,
          'saving again replaces the custom sections instead of adding more');
select results_eq($$select i.title, i.subtitle, i.period, i.visible, i.sort from public.author_items i
                    where i.section_id = 'education' order by i.sort$$,
                  $$values ('BSc Physics'::text, 'RUPP'::text, '2012–2016'::text, true, 1),
                           ('MSc', 'Somewhere', '2018', false, 2)$$,
                  'items keep their order; an item can be hidden');
select results_eq($$select hidden, name from public.profile$$, $$values ('{email,years}'::text[], 'Teacher'::text)$$,
                  'the profile keeps what to hide');
select is((select action from public.audit_events order by id desc limit 1), 'author.update', 'audited');

select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher"}', '[]', 'skills'))$$,
                 'PT422', null, 'every built-in section must be there');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher"}',
                   '[{"kind":"skills","title":"Again","visible":true,"items":[]}]'))$$,
                 'PT422', null, 'and only once');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher"}',
                   '[{"kind":"weird","title":"X","visible":true,"items":[]}]'))$$,
                 'PT422', null, 'a section is a built-in kind or custom');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"T","email":"not-an-email"}'))$$, '23514', null,
                 'a malformed email is refused');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","hidden":["name"]}'))$$,
                 '23514', null, 'the name cannot be hidden');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher"}',
                   '[{"kind":"custom","title":"Links","visible":true,"items":[{"title":"x","url":"http://x.example"}]}]'))$$,
                 '23514', null, 'links are https');
select is((select count(*)::int from public.author_sections where kind = 'custom'), 2, 'a refused save changes nothing');

-- ── What visitors get ─────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.author_page() -> 'profile' ->> 'email', null, 'a hidden email never reaches visitors');
select is(public.author_page() -> 'profile' -> 'years', 'null'::jsonb, 'nor hidden years');
select is(public.author_page() -> 'profile' ->> 'students', '500', 'shown facts do');
select is((select jsonb_agg(s ->> 'id') from jsonb_array_elements(public.author_page() -> 'sections') s
           where s ->> 'kind' <> 'custom'),
          '["life_posts","education","experience","skills","awards","hobbies","timeline"]'::jsonb,
          'sections come in the owner''s order');
select is((select jsonb_agg(s ->> 'title') from jsonb_array_elements(public.author_page() -> 'sections') s
           where s ->> 'kind' = 'custom'), '["Languages"]'::jsonb, 'a hidden section is left out');
select is((select s -> 'items' from jsonb_array_elements(public.author_page() -> 'sections') s
           where s ->> 'id' = 'education'),
          '[{"tags":[],"url":null,"note":"With *honours*.","title":"BSc Physics","period":"2012–2016","subtitle":"RUPP"}]'::jsonb,
          'and so is a hidden item');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","years":"9","students":null,"email":" "}'))$$,
                'an empty email and empty stats are saved as nothing to show');
reset role;
select results_eq($$select years, students, email from public.profile$$,
                  $$values (9::smallint, null::integer, null::text)$$, 'stored as null');

select * from finish();
rollback;
