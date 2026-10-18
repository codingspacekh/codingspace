-- The photo's shape on the Author page (owner request 2026-10-18): hexagon, circle, octagon or
-- rectangle, saved with the page; an admin that sends no shape keeps the saved one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create function pg_temp.page(profile jsonb) returns jsonb language sql as $$
  select jsonb_build_object('profile', profile, 'sections',
    (select jsonb_agg(jsonb_build_object('kind', k, 'title', initcap(k), 'items', '[]'::jsonb))
     from unnest(array['timeline', 'experience', 'education', 'skills', 'awards', 'hobbies', 'life_posts']) k));
$$;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.profile (id, name) values (true, 'Teacher');
select is((select photo_shape from public.profile), 'hexagon', 'the hexagon is the default');
select throws_ok($$update public.profile set photo_shape = 'star'$$, '23514', null, 'only the four shapes are allowed');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","photo_shape":"circle"}'))$$,
                'the owner saves a circle');
select is((select photo_shape from public.profile), 'circle', 'and it is stored');
select lives_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher"}'))$$,
                'an older admin saves without a shape');
select is((select photo_shape from public.profile), 'circle', 'and the saved shape stays');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.author_page() -> 'profile' ->> 'photo_shape', 'circle', 'visitors get the shape from author_page()');

select * from finish();
rollback;
