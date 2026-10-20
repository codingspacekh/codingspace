-- On-site downloads (2026-10-20): 'app' media up to 2 GiB, served by a project's download buttons.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.media (id, kind, mime, bytes, sha256, original_name)
  values ('41000000-0000-0000-0000-000000000001', 'app', 'application/vnd.microsoft.portable-executable',
          524288000, repeat('c', 64), 'EasyMedia-Setup-0.11.0.exe'),
         ('41000000-0000-0000-0000-000000000002', 'file', 'application/pdf', 100, repeat('d', 64), 'guide.pdf');

select lives_ok($$insert into public.media (id, kind, mime, bytes, sha256, original_name)
  values ('41000000-0000-0000-0000-000000000003', 'app', 'application/zip', 2147483648, repeat('e', 64), 'big.zip')$$,
  'an app may be 2 GiB');
select throws_ok($$insert into public.media (id, kind, mime, bytes, sha256, original_name)
  values ('41000000-0000-0000-0000-000000000004', 'app', 'application/zip', 2147483649, repeat('f', 64), 'huge.zip')$$,
  '23514', null, 'but no bigger');
select throws_ok($$insert into public.media (id, kind, mime, bytes, sha256, original_name)
  values ('41000000-0000-0000-0000-000000000005', 'file', 'application/pdf', 52428801, repeat('0', 64), 'big.pdf')$$,
  '23514', null, 'other files still stop at 50 MB');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
create temp table ids (id uuid) on commit drop;
insert into ids select public.admin_save_project(null, $${
  "slug": "easymedia", "name": "EasyMedia", "description": "A video and audio editor.",
  "downloads": [
    {"label": "Windows", "note": "Installer", "platform": "windows",
     "media": "41000000-0000-0000-0000-000000000001", "name": "forged.exe", "bytes": 1, "sha256": "x"},
    {"label": "Linux", "url": "https://github.com/codingspacekh/EasyMedia/releases"}
  ]
}$$::jsonb);

select results_eq(
  $$select d ->> 'label', d ->> 'note', d ->> 'platform', d ->> 'name', (d ->> 'bytes')::bigint, d ->> 'sha256', d ? 'url'
      from public.projects j, jsonb_array_elements(j.downloads) d where j.slug = 'easymedia' and d ? 'media'$$,
  $$values ('Windows'::text, 'Installer'::text, 'windows'::text, 'EasyMedia-Setup-0.11.0.exe'::text, 524288000::bigint,
            repeat('c', 64), false)$$,
  'a file download copies the name, size and checksum from the library, whatever the browser sent');
select is((select downloads -> 1 ->> 'url' from public.projects where slug = 'easymedia'),
          'https://github.com/codingspacekh/EasyMedia/releases', 'links stay as they are, in order');

select throws_ok(format($$select public.admin_save_project(%L, '{"name":"EasyMedia","description":"x",
  "downloads":[{"label":"Guide","media":"41000000-0000-0000-0000-000000000002"}]}')$$, (select id from ids)),
  'PT422', 'downloads must be app files from the media library', 'a PDF is not an app');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"EasyMedia","description":"x",
  "downloads":[{"label":"Windows","media":"41000000-0000-0000-0000-0000000000ff"}]}')$$, (select id from ids)),
  'PT422', null, 'the file must exist');
select throws_ok(format($$select public.admin_save_project(%L, '{"name":"EasyMedia","description":"x",
  "downloads":{"label":"Windows"}}')$$, (select id from ids)), '23514', null, 'downloads are a list');

select is((select use_count from public.admin_media where id = '41000000-0000-0000-0000-000000000001'), 1,
          'a download counts as a use');
select throws_ok($$select public.admin_delete_media('41000000-0000-0000-0000-000000000001')$$, 'PT409',
                 'this file is a download of EasyMedia', 'a download cannot be deleted from the library');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select downloads -> 0 ->> 'sha256' from public.public_projects where slug = 'easymedia'), repeat('c', 64),
          'visitors see the checksum');

select * from finish();
rollback;
