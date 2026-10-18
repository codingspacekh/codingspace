-- Media folders (v1.1): owner-only, one level, unique names, deleting a folder keeps its files.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public', 'media_folders', 'media_folders table exists');
select has_column('public', 'media', 'folder_id', 'media has a folder');
select ok((select relrowsecurity from pg_class where oid = 'public.media_folders'::regclass), 'RLS is on');
select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array['public.admin_save_media_folder(uuid,text)', 'public.admin_delete_media_folder(uuid)',
                    'public.admin_move_media(uuid[],uuid)']) f;

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.media (id, kind, mime, bytes, sha256, widths, original_name)
  values ('31000000-0000-0000-0000-000000000001', 'file', 'application/pdf', 10, repeat('a', 64), '{}', 'a.pdf'),
         ('31000000-0000-0000-0000-000000000002', 'file', 'application/pdf', 10, repeat('b', 64), '{}', 'b.pdf'),
         ('31000000-0000-0000-0000-000000000003', 'file', 'application/pdf', 10, repeat('c', 64), '{}', 'c.pdf');
insert into public.media_folders (id, name) values ('41000000-0000-0000-0000-000000000001', 'Physics');

-- ── Visitors and other accounts ───────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.media_folders', '42501', null, 'anon cannot read folders');
select throws_ok('select count(*) from public.admin_media_folders', '42501', null, 'nor the folder list');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::int from public.admin_media_folders), 0, 'a non-owner sees no folders');
select throws_ok($$select public.admin_delete_media_folder('41000000-0000-0000-0000-000000000001')$$, 'PT404', null,
                 'and cannot delete one');
select is(public.admin_move_media('{31000000-0000-0000-0000-000000000001}', null), 0, 'nor move files');

-- ── The owner ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

select set_config('test.maths', public.admin_save_media_folder(null, '  Maths diagrams ')::text, true);
select is((select name from public.media_folders where id = current_setting('test.maths')::uuid), 'Maths diagrams',
          'a new folder, its name trimmed');
select is((select action from public.audit_events order by id desc limit 1), 'media_folder.create', 'audited');
select throws_ok($$select public.admin_save_media_folder(null, 'physics')$$, 'PT409', null,
                 'two folders cannot share a name, whatever the case');
select throws_ok($$select public.admin_save_media_folder(null, '   ')$$, 'PT422', null, 'a name is needed');
select lives_ok($$select public.admin_save_media_folder(current_setting('test.maths')::uuid, 'Maths')$$, 'rename');
select throws_ok($$select public.admin_save_media_folder('49999999-0000-0000-0000-000000000000', 'X')$$, 'PT404',
                 null, 'renaming a folder that isn''t there');

select is(public.admin_move_media('{31000000-0000-0000-0000-000000000001,31000000-0000-0000-0000-000000000002}',
                                  '41000000-0000-0000-0000-000000000001'), 2, 'move two files into Physics');
select is(public.admin_move_media('{31000000-0000-0000-0000-000000000001}', '41000000-0000-0000-0000-000000000001'),
          0, 'moving a file where it already is changes nothing');
select results_eq($$select name, file_count from public.admin_media_folders order by name$$,
                  $$values ('Maths'::text, 0), ('Physics', 2)$$, 'the folder list counts the files');
select is((select folder_id::text from public.admin_media where id = '31000000-0000-0000-0000-000000000002'),
          '41000000-0000-0000-0000-000000000001', 'the library shows each file''s folder');
select throws_ok($$select public.admin_move_media('{31000000-0000-0000-0000-000000000003}',
                   '49999999-0000-0000-0000-000000000000')$$, 'PT404', null, 'into a folder that isn''t there');
select is(public.admin_move_media('{31000000-0000-0000-0000-000000000002}', null), 1, 'back to Unsorted');
select is((select entity_id from public.audit_events order by id desc limit 1), 'unsorted', 'audited as Unsorted');

select is(public.admin_delete_media_folder('41000000-0000-0000-0000-000000000001'), 1,
          'deleting a folder says how many files go back to Unsorted');
select is((select count(*)::int from public.media where folder_id is null), 3, 'and keeps every file');

select * from finish();
rollback;
