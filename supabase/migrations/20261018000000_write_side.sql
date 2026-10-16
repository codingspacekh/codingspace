-- M3 write side (03 ADM-03, ADM-05…09, §6.3, §8.2).
--
-- A post has a draft (title, summary, body and settings) and a live snapshot (live_*), which
-- is all students see. Saving changes only the draft; Publish / Update copies it to live.
-- Every change is one admin_* function: one transaction, with its revision and audit rows.
-- The functions run as the caller (security invoker), so RLS decides who may change what:
-- the owner with 2FA, or the service role (the scheduled-publish cron).
-- Errors use PostgREST's PTxxx codes, which become that HTTP status: PT404, PT409, PT422.

-- ── posts: revision counter and live copies of the settings ───────────────
alter table public.posts
  add column revision integer not null default 1 check (revision >= 1),
  add column live_revision integer,
  add column live_subject_id text references public.subjects (id),
  add column live_section_id uuid references public.sections (id) on delete restrict,
  add column live_level smallint check (live_level between 1 and 3),
  add column live_minutes smallint check (live_minutes between 1 and 600),
  add column live_problem_count smallint check (live_problem_count between 0 and 500),
  add column live_lang text check (live_lang in ('en', 'km'));

update public.posts
  set live_revision = revision, live_subject_id = subject_id, live_section_id = section_id, live_level = level,
      live_minutes = minutes, live_problem_count = problem_count, live_lang = lang
  where status = 'published';

alter table public.posts
  add constraint posts_live_complete check (
    status <> 'published' or (
      live_revision is not null and live_level is not null and live_minutes is not null
      and live_problem_count is not null and live_lang is not null
      and (kind = 'life' or live_subject_id is not null))),
  add constraint posts_scheduled_has_time check (status <> 'scheduled' or scheduled_at is not null);

drop index public.posts_section_sort;
create index posts_live_section_sort on public.posts (live_section_id, sort) where status = 'published';
create index posts_due on public.posts (scheduled_at) where status = 'scheduled';

-- Visitors read live settings only; the draft ones may hold unpublished changes.
revoke select (subject_id, section_id, level, minutes, problem_count, lang) on public.posts from anon;
grant select (live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  on public.posts to anon;

create or replace view public.public_posts with (security_invoker = true) as
  select id, kind, slug, live_subject_id as subject_id, live_section_id as section_id, sort,
         live_level as level, live_minutes as minutes, live_problem_count as problem_count, live_lang as lang,
         live_title as title, live_summary as summary, live_html as html, live_toc as toc,
         live_has_math as has_math, live_has_code as has_code, live_search as search,
         published_at, coalesce(live_updated_at, published_at) as updated_at
  from public.posts
  where status = 'published';

create or replace view public.public_sections with (security_invoker = true) as
  select s.id, s.subject_id, s.slug, s.title, s.description, s.sort,
         (select count(*)::int from public.posts p
           where p.live_section_id = s.id and p.kind = 'lesson' and p.status = 'published') as lesson_count
  from public.sections s;

-- ── Guards on every write (functions, the import script, the SQL editor) ──
create or replace function private.posts_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind then
      raise exception 'a post''s type cannot change' using errcode = 'PT422';
    end if;
    -- Links to a published lesson must keep working (no redirects yet).
    if old.published_at is not null and new.slug <> old.slug then
      raise exception 'the URL is locked once a post has been published' using errcode = 'PT422';
    end if;
  end if;
  if new.section_id is not null and new.subject_id is distinct from
     (select s.subject_id from public.sections s where s.id = new.section_id) then
    raise exception 'the section belongs to another subject' using errcode = 'PT422';
  end if;
  if new.live_section_id is not null and new.live_subject_id is distinct from
     (select s.subject_id from public.sections s where s.id = new.live_section_id) then
    raise exception 'the live section belongs to another subject' using errcode = 'PT422';
  end if;
  return new;
end;
$$;
create trigger posts_guard before insert or update on public.posts
  for each row execute function private.posts_guard();

-- ── post_revisions: draft history (kept: last 50 per post) ───────────────
create table public.post_revisions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  revision integer not null,
  reason text not null check (reason in ('autosave', 'publish', 'restore')),
  title text not null,
  summary text not null,
  content_json jsonb not null,
  created_at timestamptz not null default now()
);
create index post_revisions_post on public.post_revisions (post_id, id desc);

alter table public.post_revisions enable row level security;
revoke all on public.post_revisions from anon, authenticated;
grant select, insert, delete on public.post_revisions to authenticated;
create policy revisions_owner on public.post_revisions for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── admin_posts: the posts list and dashboard (owner only, through RLS) ──
create view public.admin_posts with (security_invoker = true) as
  select id, kind, slug, title, summary, subject_id, section_id, sort, level, minutes, problem_count, lang,
         status, revision, live_revision, scheduled_at, published_at, updated_at, live_updated_at,
         (status = 'published' and revision > live_revision) as has_unpublished_changes
  from public.posts;
revoke all on public.admin_posts from anon, authenticated;
grant select on public.admin_posts to authenticated;

-- ── Helpers ───────────────────────────────────────────────────────────────
create or replace function private.audit_post(p_action text, p_post uuid, p_meta jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.audit_events (action, entity, entity_id, meta)
  values (p_action, 'post', p_post::text,
          p_meta || case when (select auth.role()) = 'service_role' then '{"via":"service"}'::jsonb else '{}'::jsonb end);
$$;

-- The row, locked for this transaction. Not found also means "not yours" (RLS).
create or replace function private.lock_post(p_id uuid, p_revision integer default null)
returns public.posts language plpgsql set search_path = '' as $$
declare
  r public.posts;
begin
  select * into r from public.posts where id = p_id for update;
  if not found then
    raise exception 'post not found' using errcode = 'PT404';
  end if;
  if p_revision is not null and r.revision <> p_revision then
    raise exception 'the post changed since revision %', p_revision using errcode = 'PT409',
      detail = format('current revision: %s', r.revision);
  end if;
  return r;
end;
$$;

-- 03 ADM-07: the required items. (Recommended ones are warnings in the editor.)
create or replace function private.assert_publishable(r public.posts)
returns void language plpgsql set search_path = '' as $$
begin
  if btrim(r.title) = '' then
    raise exception 'a title is required' using errcode = 'PT422';
  end if;
  if r.kind = 'lesson' and r.section_id is null then
    raise exception 'a lesson needs a section' using errcode = 'PT422';
  end if;
end;
$$;

create or replace function private.keep_revision(r public.posts, p_reason text)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.post_revisions (post_id, revision, reason, title, summary, content_json)
    values (r.id, r.revision, p_reason, r.title, r.summary, r.content_json);
  delete from public.post_revisions
    where post_id = r.id and id not in (
      select id from public.post_revisions where post_id = r.id order by id desc limit 50);
end;
$$;

revoke all on function private.audit_post(text, uuid, jsonb), private.lock_post(uuid, integer),
  private.assert_publishable(public.posts), private.keep_revision(public.posts, text) from public;
grant execute on function private.audit_post(text, uuid, jsonb), private.lock_post(uuid, integer),
  private.assert_publishable(public.posts), private.keep_revision(public.posts, text) to authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.is_owner() to service_role;

-- ── Create ────────────────────────────────────────────────────────────────
create or replace function public.admin_create_post(
  p_kind text, p_title text, p_slug text, p_subject_id text, p_section_id uuid, p_lang text)
returns uuid language plpgsql set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.posts (kind, title, slug, subject_id, section_id, lang)
    values (p_kind, p_title, p_slug, p_subject_id, p_section_id, p_lang)
    returning id into new_id;
  perform private.audit_post('post.create', new_id, jsonb_build_object('slug', p_slug, 'kind', p_kind));
  return new_id;
end;
$$;

-- ── Save the draft (autosave). Returns the new revision. ──────────────────
create or replace function public.admin_save_post(p_id uuid, p_revision integer, p_fields jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  editable constant text[] := array['title', 'summary', 'content_json', 'slug', 'subject_id', 'section_id',
                                    'level', 'minutes', 'problem_count', 'lang'];
  bad text;
  r public.posts;
  last_kept timestamptz;
begin
  select k into bad from jsonb_object_keys(p_fields) k where k <> all (editable) limit 1;
  if bad is not null then
    raise exception 'field "%" cannot be saved', bad using errcode = 'PT422';
  end if;
  perform private.lock_post(p_id, p_revision);

  update public.posts set
    title = coalesce(p_fields ->> 'title', title),
    summary = coalesce(p_fields ->> 'summary', summary),
    content_json = coalesce(p_fields -> 'content_json', content_json),
    slug = coalesce(p_fields ->> 'slug', slug),
    subject_id = case when p_fields ? 'subject_id' then p_fields ->> 'subject_id' else subject_id end,
    section_id = case when p_fields ? 'section_id' then (p_fields ->> 'section_id')::uuid else section_id end,
    level = coalesce((p_fields ->> 'level')::smallint, level),
    minutes = coalesce((p_fields ->> 'minutes')::smallint, minutes),
    problem_count = coalesce((p_fields ->> 'problem_count')::smallint, problem_count),
    lang = coalesce(p_fields ->> 'lang', lang),
    revision = revision + 1
  where id = p_id
  returning * into r;

  -- Autosave runs about once a second while typing: keep one revision (and one audit row)
  -- per 10 minutes of editing, not one per keystroke.
  select max(created_at) into last_kept from public.post_revisions where post_id = p_id;
  if last_kept is null or last_kept < now() - interval '10 minutes' then
    perform private.keep_revision(r, 'autosave');
    perform private.audit_post('post.save', p_id, jsonb_build_object('revision', r.revision));
  end if;
  return r.revision;
end;
$$;

-- ── Publish / Update. p_render is the renderer's output for this revision. ─
create or replace function public.admin_publish_post(p_id uuid, p_revision integer, p_render jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.posts;
  was_published boolean;
  previous_subject text;
begin
  r := private.lock_post(p_id, p_revision);
  perform private.assert_publishable(r);
  if coalesce(p_render ->> 'html', '') = '' then
    raise exception 'nothing to publish: the rendered body is empty' using errcode = 'PT422';
  end if;
  was_published := r.status = 'published';
  previous_subject := case when was_published then r.live_subject_id end;

  update public.posts set
    live_title = title, live_summary = summary,
    live_html = p_render ->> 'html',
    live_toc = coalesce(p_render -> 'toc', '[]'::jsonb),
    live_search_text = coalesce(p_render ->> 'search_text', ''),
    live_has_math = coalesce((p_render ->> 'has_math')::boolean, false),
    live_has_code = coalesce((p_render ->> 'has_code')::boolean, false),
    live_subject_id = subject_id, live_section_id = section_id, live_level = level, live_minutes = minutes,
    live_problem_count = problem_count, live_lang = lang, live_revision = revision,
    status = 'published', scheduled_at = null,
    published_at = coalesce(published_at, now()), live_updated_at = now()
  where id = p_id
  returning * into r;

  perform private.keep_revision(r, 'publish');
  perform private.audit_post(case when was_published then 'post.update' else 'post.publish' end, p_id,
                             jsonb_build_object('revision', r.revision, 'slug', r.slug));
  return jsonb_build_object('slug', r.slug, 'kind', r.kind, 'subject', r.live_subject_id,
                            'previous_subject', previous_subject, 'was_published', was_published,
                            'published_at', r.published_at);
end;
$$;

-- ── Unpublish: back to a draft. The URL and first publish date are kept. ──
create or replace function public.admin_unpublish_post(p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.posts;
begin
  r := private.lock_post(p_id);
  if r.status <> 'published' then
    raise exception 'the post is not published' using errcode = 'PT409';
  end if;
  update public.posts set status = 'draft' where id = p_id;
  perform private.audit_post('post.unpublish', p_id, jsonb_build_object('slug', r.slug));
  return jsonb_build_object('slug', r.slug, 'kind', r.kind, 'subject', r.live_subject_id);
end;
$$;

-- ── Schedule a draft; the cron publishes it when due (03 §6.1). ───────────
create or replace function public.admin_schedule_post(p_id uuid, p_revision integer, p_at timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  r public.posts;
begin
  r := private.lock_post(p_id, p_revision);
  if r.status = 'published' then
    raise exception 'the post is already published' using errcode = 'PT409';
  end if;
  if p_at is null or p_at <= now() then
    raise exception 'the publish time must be in the future' using errcode = 'PT422';
  end if;
  perform private.assert_publishable(r);
  update public.posts set status = 'scheduled', scheduled_at = p_at where id = p_id;
  perform private.audit_post('post.schedule', p_id, jsonb_build_object('at', p_at));
end;
$$;

create or replace function public.admin_unschedule_post(p_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  r public.posts;
begin
  r := private.lock_post(p_id);
  if r.status <> 'scheduled' then
    raise exception 'the post is not scheduled' using errcode = 'PT409';
  end if;
  update public.posts set status = 'draft', scheduled_at = null where id = p_id;
  perform private.audit_post('post.unschedule', p_id);
end;
$$;

-- ── Restore an old revision into the draft. Returns the new revision. ────
create or replace function public.admin_restore_revision(p_id uuid, p_revision integer, p_revision_id bigint)
returns integer language plpgsql set search_path = '' as $$
declare
  old public.post_revisions;
  r public.posts;
begin
  perform private.lock_post(p_id, p_revision);
  select * into old from public.post_revisions where id = p_revision_id and post_id = p_id;
  if not found then
    raise exception 'revision not found' using errcode = 'PT404';
  end if;
  update public.posts
    set title = old.title, summary = old.summary, content_json = old.content_json, revision = revision + 1
    where id = p_id
    returning * into r;
  perform private.keep_revision(r, 'restore');
  perform private.audit_post('post.restore', p_id, jsonb_build_object('from_revision', old.revision));
  return r.revision;
end;
$$;

-- ── Delete (with its revisions). The audit row keeps what was removed. ───
create or replace function public.admin_delete_post(p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.posts;
begin
  r := private.lock_post(p_id);
  delete from public.posts where id = p_id;
  perform private.audit_post('post.delete', p_id,
    jsonb_build_object('slug', r.slug, 'title', r.title, 'was_published', r.status = 'published'));
  return jsonb_build_object('slug', r.slug, 'kind', r.kind, 'subject', r.live_subject_id,
                            'was_published', r.status = 'published');
end;
$$;

revoke all on function
  public.admin_create_post(text, text, text, text, uuid, text),
  public.admin_save_post(uuid, integer, jsonb),
  public.admin_publish_post(uuid, integer, jsonb),
  public.admin_unpublish_post(uuid),
  public.admin_schedule_post(uuid, integer, timestamptz),
  public.admin_unschedule_post(uuid),
  public.admin_restore_revision(uuid, integer, bigint),
  public.admin_delete_post(uuid)
  from public, anon;
grant execute on function
  public.admin_create_post(text, text, text, text, uuid, text),
  public.admin_save_post(uuid, integer, jsonb),
  public.admin_publish_post(uuid, integer, jsonb),
  public.admin_unpublish_post(uuid),
  public.admin_schedule_post(uuid, integer, timestamptz),
  public.admin_unschedule_post(uuid),
  public.admin_restore_revision(uuid, integer, bigint),
  public.admin_delete_post(uuid)
  to authenticated, service_role;
