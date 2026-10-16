-- Found in the owner's first test on staging (2026-10-16):
-- 1. A new lesson got sort 0, so it went to the top of its section instead of the end.
--    Now it goes after the last lesson, and moving it to another section puts it last there.
-- 2. Publishing rebuilt the lesson, its subject page and Home, but not the other lessons in
--    its section, whose prev/next links and section list then showed the old order. The
--    functions now return the section(s), so the app can rebuild those lesson pages too.

-- After the last lesson in the section (draft or live), or 1 in an empty section.
create or replace function private.next_sort(p_section uuid)
returns integer language sql stable set search_path = '' as $$
  select coalesce(max(sort), 0) + 1 from public.posts where section_id = p_section or live_section_id = p_section;
$$;
revoke all on function private.next_sort(uuid) from public;
grant execute on function private.next_sort(uuid) to authenticated, service_role;

create or replace function public.admin_create_post(
  p_kind text, p_title text, p_slug text, p_subject_id text, p_section_id uuid, p_lang text)
returns uuid language plpgsql set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.posts (kind, title, slug, subject_id, section_id, lang, sort)
    values (p_kind, p_title, p_slug, p_subject_id, p_section_id, p_lang,
            case when p_section_id is null then 0 else private.next_sort(p_section_id) end)
    returning id into new_id;
  perform private.audit_post('post.create', new_id, jsonb_build_object('slug', p_slug, 'kind', p_kind));
  return new_id;
end;
$$;

create or replace function public.admin_save_post(p_id uuid, p_revision integer, p_fields jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  editable constant text[] := array['title', 'summary', 'content_json', 'slug', 'subject_id', 'section_id',
                                    'level', 'minutes', 'problem_count', 'lang'];
  bad text;
  before public.posts;
  r public.posts;
  new_section uuid;
  last_kept timestamptz;
begin
  select k into bad from jsonb_object_keys(p_fields) k where k <> all (editable) limit 1;
  if bad is not null then
    raise exception 'field "%" cannot be saved', bad using errcode = 'PT422';
  end if;
  before := private.lock_post(p_id, p_revision);
  new_section := case when p_fields ? 'section_id' then (p_fields ->> 'section_id')::uuid else before.section_id end;

  update public.posts set
    title = coalesce(p_fields ->> 'title', title),
    summary = coalesce(p_fields ->> 'summary', summary),
    content_json = coalesce(p_fields -> 'content_json', content_json),
    slug = coalesce(p_fields ->> 'slug', slug),
    subject_id = case when p_fields ? 'subject_id' then p_fields ->> 'subject_id' else subject_id end,
    section_id = new_section,
    -- Moving to another section: last place there.
    sort = case when new_section is distinct from before.section_id and new_section is not null
                then private.next_sort(new_section) else sort end,
    level = coalesce((p_fields ->> 'level')::smallint, level),
    minutes = coalesce((p_fields ->> 'minutes')::smallint, minutes),
    problem_count = coalesce((p_fields ->> 'problem_count')::smallint, problem_count),
    lang = coalesce(p_fields ->> 'lang', lang),
    revision = revision + 1
  where id = p_id
  returning * into r;

  select max(created_at) into last_kept from public.post_revisions where post_id = p_id;
  if last_kept is null or last_kept < now() - interval '10 minutes' then
    perform private.keep_revision(r, 'autosave');
    perform private.audit_post('post.save', p_id, jsonb_build_object('revision', r.revision));
  end if;
  return r.revision;
end;
$$;

create or replace function public.admin_publish_post(p_id uuid, p_revision integer, p_render jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.posts;
  was_published boolean;
  previous_subject text;
  previous_section uuid;
begin
  r := private.lock_post(p_id, p_revision);
  perform private.assert_publishable(r);
  if coalesce(p_render ->> 'html', '') = '' then
    raise exception 'nothing to publish: the rendered body is empty' using errcode = 'PT422';
  end if;
  was_published := r.status = 'published';
  previous_subject := case when was_published then r.live_subject_id end;
  previous_section := case when was_published then r.live_section_id end;

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
                            'previous_subject', previous_subject, 'section', r.live_section_id,
                            'previous_section', previous_section, 'was_published', was_published,
                            'published_at', r.published_at);
end;
$$;

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
  return jsonb_build_object('slug', r.slug, 'kind', r.kind, 'subject', r.live_subject_id, 'section', r.live_section_id);
end;
$$;

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
                            'section', case when r.status = 'published' then r.live_section_id end,
                            'was_published', r.status = 'published');
end;
$$;
