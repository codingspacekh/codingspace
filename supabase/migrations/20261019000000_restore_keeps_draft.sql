-- M3 (03 ADM-06): restoring an old revision first keeps the current draft as a revision, so a
-- restore can be undone. Autosave keeps only one revision per 10 minutes, so without this
-- the latest edits could be lost by a restore.

alter table public.post_revisions drop constraint post_revisions_reason_check;
alter table public.post_revisions
  add constraint post_revisions_reason_check check (reason in ('autosave', 'publish', 'restore', 'before_restore'));

create or replace function public.admin_restore_revision(p_id uuid, p_revision integer, p_revision_id bigint)
returns integer language plpgsql set search_path = '' as $$
declare
  old public.post_revisions;
  r public.posts;
begin
  r := private.lock_post(p_id, p_revision);
  select * into old from public.post_revisions where id = p_revision_id and post_id = p_id;
  if not found then
    raise exception 'revision not found' using errcode = 'PT404';
  end if;
  perform private.keep_revision(r, 'before_restore');
  update public.posts
    set title = old.title, summary = old.summary, content_json = old.content_json, revision = revision + 1
    where id = p_id
    returning * into r;
  perform private.keep_revision(r, 'restore');
  perform private.audit_post('post.restore', p_id, jsonb_build_object('from_revision', old.revision));
  return r.revision;
end;
$$;
