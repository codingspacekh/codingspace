-- The landing page redesign (2026-10-20): new sections, the showcase, and the owner's order.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.media (id, kind, mime, bytes, sha256, width, height, widths, alt, original_name)
  values ('42000000-0000-0000-0000-000000000001', 'image', 'image/png', 100, repeat('a', 64), 1440, 900,
          '{480,960,1440}', 'Video mode', 'video.png'),
         ('42000000-0000-0000-0000-000000000002', 'file', 'application/pdf', 100, repeat('b', 64), null, null, '{}',
          '', 'guide.pdf');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
create temp table ids (id uuid) on commit drop;
insert into ids select public.admin_save_project(null, $${
  "slug": "easymedia", "name": "EasyMedia", "description": "A video and audio editor.",
  "highlights": [{"value": "4 GB", "label": "of RAM is enough"}],
  "why_title": " Chapter 11 used to need five programs ", "why_text": "DaVinci needs a strong GPU.",
  "replaces": [{"name": "DaVinci Resolve", "note": "needs a strong GPU"}],
  "reasons": [{"title": "One window", "text": ""}],
  "requirements": [{"part": "Memory", "minimum": "4 GB", "recommended": "8 GB"}],
  "requirements_note": "If it runs Windows 11, it meets the minimum.",
  "release_date": "2026-10-19", "release_notes": "Learn mode\n33 transitions",
  "steps": [{"title": "Open the installer", "text": "", "platform": "windows"}],
  "section_order": ["download", "why"], "hidden_sections": ["faq"],
  "showcase": [{"media_id": "42000000-0000-0000-0000-000000000001", "label": "Video mode · 11.1",
                "title": " Trim and join ", "text": "Exact times.", "points": [{"code": "V4", "text": "Captions"}],
                "color": "lime"}]
}$$::jsonb);

select results_eq(
  $$select why_title, release_date, section_order, hidden_sections, jsonb_array_length(highlights)
      from public.projects where slug = 'easymedia'$$,
  $$values ('Chapter 11 used to need five programs'::text, '2026-10-19'::date, '{download,why}'::text[],
            '{faq}'::text[], 1)$$,
  'the new fields are saved (trimmed), with the owner''s order and hidden sections');
select is((select steps -> 0 ->> 'platform' from public.projects where slug = 'easymedia'), 'windows',
          'a step keeps its computer');
select results_eq($$select position, label, title, color, alt, widths, points -> 0 ->> 'code' from public.project_showcase$$,
                  $$values (1, 'Video mode · 11.1'::text, 'Trim and join'::text, 'lime'::text, 'Video mode'::text,
                            '{480,960,1440}'::int[], 'V4'::text)$$,
                  'a showcase row copies the image''s widths and alt text');

select throws_ok(format($$select public.admin_save_project(%L, '{"name":"EasyMedia","description":"x",
  "showcase":[{"media_id":"42000000-0000-0000-0000-000000000002","title":"x"}]}')$$, (select id from ids)),
  'PT422', 'showcase images must be images from the media library', 'a PDF is not a showcase image');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"EasyMedia","description":"x",
  "section_order":["sidebar"]}')$$, (select id from ids)), '23514', null, 'only known sections');
select throws_ok(format($$select public.admin_save_project(%L, %L)$$, (select id from ids),
  jsonb_build_object('name', 'EasyMedia', 'description', 'x',
                     'highlights', (select jsonb_agg(jsonb_build_object('value', n)) from generate_series(1, 5) n))),
  '23514', null, 'at most 4 numbers');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"EasyMedia","description":"x",
  "release_date":"next week"}')$$, (select id from ids)), '22007', null, 'the release date is a date');

select is((select use_count from public.admin_media where id = '42000000-0000-0000-0000-000000000001'), 1,
          'a showcase image counts as a use');
select throws_ok($$select public.admin_delete_media('42000000-0000-0000-0000-000000000001')$$, 'PT409',
                 'this image is a screenshot of EasyMedia', 'and cannot be deleted from the library');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select requirements -> 0 ->> 'minimum', release_notes from public.public_projects where slug = 'easymedia'$$,
                  $$values ('4 GB'::text, E'Learn mode\n33 transitions'::text)$$, 'visitors read the new fields');
select results_eq($$select s.title, s.media from public.public_project_showcase s
                    join public.public_projects p on p.id = s.project_id where p.slug = 'easymedia'$$,
                  $$values ('Trim and join'::text, '42000000-0000-0000-0000-000000000001'::uuid)$$, 'and the showcase');
select throws_ok($$insert into public.project_showcase (project_id, position, media_id, title, widths, width, height)
                   values ((select id from public.projects limit 1), 2, '42000000-0000-0000-0000-000000000001', 'x', '{1}', 1, 1)$$,
                 '42501', null, 'visitors cannot add showcase rows');

select * from finish();
rollback;
