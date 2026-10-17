-- The author's photo (03 ADM-14): an image from the library, shown to visitors, protected from deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- The whole Author page as the admin sends it, with this header.
create function pg_temp.page(profile jsonb) returns jsonb language sql as $$
  select jsonb_build_object('profile', profile, 'sections',
    (select jsonb_agg(jsonb_build_object('kind', k, 'title', k, 'visible', true, 'items', '[]'::jsonb))
     from unnest(array['timeline', 'experience', 'education', 'skills', 'awards', 'hobbies', 'life_posts']) k));
$$;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.media (id, kind, mime, bytes, sha256, width, height, widths, original_name)
  values ('30000000-0000-0000-0000-000000000001', 'image', 'image/jpeg', 1000, repeat('a', 64), 1200, 1500,
          '{480,960,1200}', 'me.jpg'),
         ('30000000-0000-0000-0000-000000000002', 'file', 'application/pdf', 10, repeat('b', 64), null, null,
          '{}', 'cv.pdf');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

select lives_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","photo_media_id":"30000000-0000-0000-0000-000000000001"}'))$$,
                'save the profile with a photo');
select results_eq($$select photo_media_id::text, photo_widths, photo_width, photo_height from public.profile$$,
                  $$values ('30000000-0000-0000-0000-000000000001'::text, '{480,960,1200}'::integer[], 1200, 1500)$$,
                  'the photo''s sizes are copied onto the profile');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","photo_media_id":"30000000-0000-0000-0000-000000000002"}'))$$,
                 'PT422', null, 'a PDF can''t be the photo');
select throws_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","photo_media_id":"39999999-0000-0000-0000-000000000000"}'))$$,
                 'PT422', null, 'nor an image that doesn''t exist');
select throws_ok($$select public.admin_delete_media('30000000-0000-0000-0000-000000000001')$$, 'PT409', null,
                 'the photo can''t be deleted from the library');
select is((select use_count from public.admin_media where id = '30000000-0000-0000-0000-000000000001'), 1,
          'the library counts it as used');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((public.author_page() -> 'profile') - array['name', 'bio', 'years', 'students', 'email'],
          '{"photo":"30000000-0000-0000-0000-000000000001","photo_widths":[480,960,1200],"photo_width":1200,"photo_height":1500}'::jsonb,
          'visitors see the photo (without the media catalogue)');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","photo_media_id":"30000000-0000-0000-0000-000000000001","hidden":["photo"]}'))$$,
                'hide the photo');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.author_page() -> 'profile' ->> 'photo', null, 'a hidden photo never reaches visitors');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_save_author(pg_temp.page('{"name":"Teacher","photo_media_id":null}'))$$, 'remove the photo');
select results_eq($$select photo_media_id, photo_widths from public.profile$$,
                  $$values (null::uuid, '{}'::integer[])$$, 'no photo: the page shows the initials again');

select * from finish();
rollback;
