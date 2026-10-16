-- Media catalogue (03 ADM-10): owner-only, post_media follows the content, used files can't be deleted.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('public', 'media', 'media table exists');
select has_table('public', 'post_media', 'post_media table exists');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.media'::regclass, 'public.post_media'::regclass)), 'RLS is on');
select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_add_media(uuid,text,text,bigint,text,integer,integer,integer[],text,text)',
                    'public.admin_update_media(uuid,text,text)', 'public.admin_delete_media(uuid)']) f;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1);
insert into public.media (id, kind, mime, bytes, sha256, width, height, widths, alt, original_name)
  values ('30000000-0000-0000-0000-000000000001', 'image', 'image/webp', 1000, repeat('a', 64), 1200, 800,
          '{480,960,1200}', 'A triangle', 'triangle.png'),
         ('30000000-0000-0000-0000-000000000002', 'file', 'application/pdf', 2000, repeat('b', 64), null, null,
          '{}', '', 'worksheet.pdf'),
         ('30000000-0000-0000-0000-000000000003', 'image', 'image/webp', 3000, repeat('c', 64), 100, 100,
          '{100}', '', 'unused.jpg');

-- ── Visitors see nothing ──────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.media', '42501', null, 'anon cannot read media');
select throws_ok('select count(*) from public.post_media', '42501', null, 'anon cannot read post_media');
select throws_ok('select count(*) from public.admin_media', '42501', null, 'anon cannot read the library');
reset role;

-- A signed-in account that isn't the owner sees no rows.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::int from public.media), 0, 'a non-owner sees no media');
select throws_ok($$select public.admin_delete_media('30000000-0000-0000-0000-000000000003')$$, 'PT404', null,
                 'and cannot delete any');

-- ── The owner ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

select is(public.admin_add_media('30000000-0000-0000-0000-000000000009', 'image', 'image/webp', 1000, repeat('a', 64),
                                 1200, 800, '{480,960,1200}', '', 'again.png') ->> 'id',
          '30000000-0000-0000-0000-000000000001', 'the same image again returns the first copy');
select is((select count(*)::int from public.media), 3, 'and adds nothing');
select is(public.admin_add_media('30000000-0000-0000-0000-000000000004', 'file', 'text/plain', 10, repeat('d', 64),
                                 null, null, null, null, ' notes.txt ') ->> 'duplicate', 'false', 'a new file is added');
select results_eq($$select original_name, widths from public.media where id = '30000000-0000-0000-0000-000000000004'$$,
                  $$values ('notes.txt'::text, '{}'::integer[])$$, 'with a trimmed name');
select is((select action from public.audit_events order by id desc limit 1), 'media.add', 'audited');
select throws_ok($$select public.admin_add_media('30000000-0000-0000-0000-000000000005', 'image', 'image/webp', 1,
                   repeat('e', 64), null, null, '{}', '', 'x.png')$$, '23514', null, 'an image needs its size');

-- A draft that uses an image (inside a callout) and a file; an unknown id is ignored.
insert into public.posts (id, kind, slug, subject_id, section_id, title, content_json)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'am-gm', 'math', '10000000-0000-0000-0000-000000000001',
          'AM–GM', '{"type":"doc","content":[
             {"type":"callout","attrs":{"variant":"note"},"content":[
               {"type":"image","attrs":{"media":"30000000-0000-0000-0000-000000000001","alt":"x"}}]},
             {"type":"file","attrs":{"media":"30000000-0000-0000-0000-000000000002","name":"w.pdf"}},
             {"type":"image","attrs":{"media":"39999999-0000-0000-0000-000000000000","alt":"gone"}},
             {"type":"image","attrs":{"media":"not-a-uuid","alt":"bad"}}]}');
select results_eq($$select media_id::text, in_draft, in_live from public.post_media order by media_id$$,
                  $$values ('30000000-0000-0000-0000-000000000001'::text, true, false),
                           ('30000000-0000-0000-0000-000000000002', true, false)$$,
                  'post_media lists the draft''s media, at any depth');

select set_config('test.rev', (select revision::text from public.posts where slug = 'am-gm'), true);
select lives_ok($$select public.admin_publish_post('20000000-0000-0000-0000-000000000001',
                  current_setting('test.rev')::int, '{"html":"<p>x</p>","toc":[],"search_text":"x"}'::jsonb)$$,
                'publish');
select results_eq($$select bool_and(in_live) from public.post_media$$, $$values (true)$$,
                  'after publishing, the same media are live');

-- The draft drops the file: it stays live until the next publish.
select lives_ok($$select public.admin_save_post('20000000-0000-0000-0000-000000000001',
                  (select revision from public.posts where slug = 'am-gm'),
                  '{"content_json":{"type":"doc","content":[
                     {"type":"image","attrs":{"media":"30000000-0000-0000-0000-000000000001","alt":"x"}}]}}'::jsonb)$$,
                'save a draft without the file');
select results_eq($$select media_id::text, in_draft, in_live from public.post_media order by media_id$$,
                  $$values ('30000000-0000-0000-0000-000000000001'::text, true, true),
                           ('30000000-0000-0000-0000-000000000002', false, true)$$,
                  'the file is still live, no longer in the draft');
select throws_ok($$select public.admin_delete_media('30000000-0000-0000-0000-000000000002')$$, 'PT409', null,
                 'a file a post uses (even only live) cannot be deleted');

select lives_ok($$select public.admin_unpublish_post('20000000-0000-0000-0000-000000000001')$$, 'unpublish');
select results_eq($$select media_id::text from public.post_media$$,
                  $$values ('30000000-0000-0000-0000-000000000001'::text)$$, 'only the draft''s media are left');

select is(public.admin_delete_media('30000000-0000-0000-0000-000000000002') ->> 'kind', 'file',
          'an unused file can be deleted');
select is((select use_count from public.admin_media where id = '30000000-0000-0000-0000-000000000001'), 1,
          'the library counts the posts that use each file');

select * from finish();
rollback;
