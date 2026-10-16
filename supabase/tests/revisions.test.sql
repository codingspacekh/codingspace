-- M3 revision history (03 ADM-06): restoring an old version must itself be undoable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

insert into ids values ('p', public.admin_create_post('life', 'First title', 'rev-test', null, null, 'en'));
select public.admin_save_post((select id from ids), 1, '{"content_json":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"v1"}]}]}}');
-- A later edit within 10 minutes: no revision of its own (autosave keeps one per 10 minutes).
select public.admin_save_post((select id from ids), 2, '{"title":"Latest title","content_json":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"latest"}]}]}}');
select is((select count(*)::int from public.post_revisions where post_id = (select id from ids)), 1,
          'one revision so far: the latest edit is only in the draft');

select is(public.admin_restore_revision((select id from ids), 3,
            (select min(id) from public.post_revisions where post_id = (select id from ids))), 4,
          'restore the first revision');
select is((select title from public.posts where id = (select id from ids)), 'First title', 'the draft has the old version');

select results_eq($$select reason, title from public.post_revisions where post_id = (select id from ids) order by id$$,
                  $$values ('autosave'::text, 'First title'::text), ('before_restore', 'Latest title'), ('restore', 'First title')$$,
                  'the draft as it was before the restore is kept, so the restore can be undone');

select is(public.admin_restore_revision((select id from ids), 4,
            (select id from public.post_revisions where post_id = (select id from ids) and reason = 'before_restore')), 5,
          'undo the restore');
select is((select content_json #>> '{content,0,content,0,text}' from public.posts where id = (select id from ids)), 'latest',
          'the latest edit is back');

select * from finish();
rollback;
