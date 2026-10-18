-- Project pages (v1.1): the landing-page fields and screenshots, saved by the owner, read by visitors.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.media (id, kind, mime, bytes, sha256, width, height, widths, alt, original_name)
  values ('40000000-0000-0000-0000-000000000001', 'image', 'image/png', 100, repeat('a', 64), 1600, 900, '{480,960,1600}',
          'The main window', 'main.png'),
         ('40000000-0000-0000-0000-000000000002', 'file', 'application/pdf', 100, repeat('b', 64), null, null, '{}', '', 'guide.pdf');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
create temp table ids (id uuid) on commit drop;
insert into ids select public.admin_save_project(null, $${
  "slug": "easy-media", "name": "Easy Media", "glyph": "▶", "description": "Cut and convert videos.",
  "platforms": ["Windows", " "], "tagline": " Video editing for class projects ",
  "intro": "Made for **students**.", "reasons": [{"title": "Free", "text": "No ads."}],
  "features": [{"glyph": "✂", "title": "Trim", "text": "Cut the start and end."}],
  "steps": [{"title": "Download", "text": "Get the installer."}],
  "faq": [{"question": "Is it free?", "answer": "Yes."}],
  "downloads": [{"label": "Windows", "url": "https://github.com/codingspacekh/easy-media/releases/download/v1.0.0/setup.exe"}],
  "version": "1.0.0", "source_url": "https://github.com/codingspacekh/easy-media",
  "screenshots": [{"media_id": "40000000-0000-0000-0000-000000000001", "caption": " Trimming a clip "}]
}$$::jsonb);

select results_eq($$select tagline, landing_url, version, platforms from public.projects where slug = 'easy-media'$$,
                  $$values ('Video editing for class projects'::text, null::text, '1.0.0'::text, '{Windows}'::text[])$$,
                  'a project without a website, trimmed, with its version');
select is((select features -> 0 ->> 'title' from public.projects where slug = 'easy-media'), 'Trim', 'the lists are kept');
select results_eq($$select position, caption, alt, widths, width from public.project_screenshots$$,
                  $$values (1, 'Trimming a clip'::text, 'The main window'::text, '{480,960,1600}'::int[], 1600)$$,
                  'a screenshot copies the image''s widths, size and alt text');

select throws_ok(format($$select public.admin_save_project(%L, '{"name":"Easy Media","description":"x",
  "screenshots":[{"media_id":"40000000-0000-0000-0000-000000000002"}]}')$$, (select id from ids)),
  'PT422', 'screenshots must be images from the media library', 'a PDF is not a screenshot');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"Easy Media","description":"x",
  "screenshots":[{"media_id":"40000000-0000-0000-0000-0000000000ff"}]}')$$, (select id from ids)),
  'PT422', null, 'a screenshot must exist');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"Easy Media","description":"x",
  "source_url":"http://github.com/x"}')$$, (select id from ids)), '23514', null, 'the source link is https');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"Easy Media","description":"x",
  "reasons":{"title":"x"}}')$$, (select id from ids)), '23514', null, 'reasons are a list');
select throws_ok(format($$select public.admin_save_project(%L, %L)$$, (select id from ids),
  jsonb_build_object('name', 'Easy Media', 'description', 'x',
                     'features', (select jsonb_agg(jsonb_build_object('title', n)) from generate_series(1, 13) n))),
  '23514', null, 'at most 12 features');

-- The image is in use: the library counts it and won't delete it.
select is((select use_count from public.admin_media where id = '40000000-0000-0000-0000-000000000001'), 1,
          'a screenshot counts as a use');
select throws_ok($$select public.admin_delete_media('40000000-0000-0000-0000-000000000001')$$, 'PT409',
                 'this image is a screenshot of Easy Media', 'a screenshot cannot be deleted from the library');

-- Visitors.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select tagline, version, jsonb_array_length(downloads) from public.public_projects where slug = 'easy-media'$$,
                  $$values ('Video editing for class projects'::text, '1.0.0'::text, 1)$$, 'visitors read the page fields');
select results_eq($$select s.position, s.caption, s.media from public.public_project_screenshots s
                    join public.public_projects p on p.id = s.project_id where p.slug = 'easy-media'$$,
                  $$values (1, 'Trimming a clip'::text, '40000000-0000-0000-0000-000000000001'::uuid)$$,
                  'and its screenshots');
select throws_ok($$select * from public.media$$, '42501', null, 'but not the media catalogue');
select throws_ok($$insert into public.project_screenshots (project_id, position, media_id, widths, width, height)
                   values ((select id from public.projects limit 1), 2, '40000000-0000-0000-0000-000000000001', '{1}', 1, 1)$$,
                 '42501', null, 'visitors cannot add screenshots');

-- Saving again replaces the screenshots; deleting the project removes them.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select public.admin_save_project((select id from ids), '{"name":"Easy Media","description":"x","screenshots":[]}');
select is((select count(*)::int from public.project_screenshots), 0, 'screenshots are replaced as a whole');
select public.admin_delete_project((select id from ids));
select is((select count(*)::int from public.projects where slug = 'easy-media'), 0, 'the project is deleted');

select * from finish();
rollback;
