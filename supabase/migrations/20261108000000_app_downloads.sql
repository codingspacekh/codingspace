-- On-site downloads (owner request 2026-10-20): a project's download buttons can now serve a
-- file uploaded here (an installer of up to 2 GB) instead of only a link to GitHub Releases.
--
-- The files are media of a new kind, 'app', stored in R2 at f/<id> like other files. A project's
-- `downloads` list keeps its shape, [{ label, url }], and an item may instead carry
-- { label, media, note?, platform? }: the file's name, size and SHA-256 are copied into the item
-- when the project is saved, so visitors (who can't read the media catalogue) see them.
-- Additive: older code reads link items as before.

-- ── media: the 'app' kind, up to 2 GiB ────────────────────────────────────
alter table public.media drop constraint media_kind_check;
alter table public.media add constraint media_kind_check check (kind in ('image', 'file', 'app'));
alter table public.media drop constraint media_bytes_check;
alter table public.media add constraint media_bytes_check
  check (bytes >= 1 and bytes <= case when kind = 'app' then 2147483648 else 52428800 end);
-- Only images have a size and variants (was: "kind = 'file' or …", which an app would fail).
alter table public.media drop constraint media_check;
alter table public.media add constraint media_check
  check (kind <> 'image' or (width is not null and height is not null and cardinality(widths) between 1 and 4));

-- ── A download that serves a file counts as a use (columns as in 20261106000000) ──
create or replace function private.download_users(p_media uuid)
returns text[] language sql stable set search_path = '' as $$
  select array_agg(distinct j.name order by j.name)
    from public.projects j, jsonb_array_elements(j.downloads) d
   where d ->> 'media' = p_media::text;
$$;
revoke all on function private.download_users(uuid) from public;
grant execute on function private.download_users(uuid) to authenticated;

create or replace view public.admin_media with (security_invoker = true) as
  select m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.widths, m.alt, m.original_name, m.created_at,
         ((select count(*)::int from public.post_media pm where pm.media_id = m.id)
          + (select count(*)::int from public.profile pr where pr.photo_media_id = m.id)
          + (select count(*)::int from public.project_screenshots ps where ps.media_id = m.id)
          + (select count(*)::int from public.projects j, jsonb_array_elements(j.downloads) d
              where d ->> 'media' = m.id::text)) as use_count,
         m.folder_id
  from public.media m;

create or replace function public.admin_delete_media(p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  m public.media;
  users text[];
begin
  select * into m from public.media where id = p_id for update;
  if not found then
    raise exception 'file not found' using errcode = 'PT404';
  end if;
  if exists (select 1 from public.profile where photo_media_id = p_id) then
    raise exception 'this image is the photo on the Author page' using errcode = 'PT409';
  end if;
  select array_agg(distinct j.name order by j.name) into users
    from public.project_screenshots ps join public.projects j on j.id = ps.project_id where ps.media_id = p_id;
  if users is not null then
    raise exception 'this image is a screenshot of %', array_to_string(users, ', ') using errcode = 'PT409';
  end if;
  users := private.download_users(p_id);
  if users is not null then
    raise exception 'this file is a download of %', array_to_string(users, ', ') using errcode = 'PT409';
  end if;
  select array_agg(p.title order by p.title) into users
    from public.post_media pm join public.posts p on p.id = pm.post_id where pm.media_id = p_id;
  if users is not null then
    raise exception 'this file is used by %', array_to_string(users, ', ') using errcode = 'PT409';
  end if;
  delete from public.media where id = p_id;
  perform private.audit_media('media.delete', p_id, jsonb_build_object('name', m.original_name));
  return jsonb_build_object('kind', m.kind, 'widths', to_jsonb(m.widths));
end;
$$;

-- ── Saving a project: as in 20261102000000, plus file downloads ───────────
-- p.downloads: [{ label, url } | { label, media, note?, platform? }]. A file must be an 'app'
-- in the media library; its name, bytes and sha256 are (re)copied from there.
create or replace function public.admin_save_project(p_id uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  plats text[] := coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'platforms') x
                            where btrim(x) <> ''), '{}');
  shots jsonb := coalesce(p -> 'screenshots', '[]');
  dls jsonb := coalesce(p -> 'downloads', '[]');
begin
  if jsonb_typeof(shots) <> 'array' or jsonb_array_length(shots) > 8 then
    raise exception 'at most 8 screenshots' using errcode = 'PT422';
  end if;
  if exists (select 1 from jsonb_array_elements(shots) s
               left join public.media m on m.id = (s ->> 'media_id')::uuid
              where m.id is null or m.kind <> 'image') then
    raise exception 'screenshots must be images from the media library' using errcode = 'PT422';
  end if;
  -- Not a list: left as it is, for the column's own check to refuse.
  if jsonb_typeof(dls) = 'array' then
    if exists (select 1 from jsonb_array_elements(dls) d
                 left join public.media m on m.id = (d ->> 'media')::uuid
                where d ? 'media' and (m.id is null or m.kind <> 'app')) then
      raise exception 'downloads must be app files from the media library' using errcode = 'PT422';
    end if;
    select coalesce(jsonb_agg(
             case when d ? 'media'
                  then (d - 'url' - 'name' - 'bytes' - 'sha256')
                       || jsonb_build_object('name', m.original_name, 'bytes', m.bytes, 'sha256', m.sha256)
                  else d end
             order by n), '[]')
      into dls
      from jsonb_array_elements(dls) with ordinality x(d, n)
      left join public.media m on m.id = (d ->> 'media')::uuid;
  end if;

  if p_id is null then
    insert into public.projects (slug, name, glyph, subject_id, tag, description, platforms, landing_url, sort)
      values (p ->> 'slug', btrim(p ->> 'name'), coalesce(btrim(p ->> 'glyph'), ''), nullif(p ->> 'subject_id', ''),
              coalesce(btrim(p ->> 'tag'), ''), btrim(p ->> 'description'), plats,
              nullif(btrim(coalesce(p ->> 'landing_url', '')), ''),
              coalesce((select max(sort) from public.projects), 0) + 1)
      returning id into saved;
    perform private.audit_site('project.create', 'project', saved::text, jsonb_build_object('name', p ->> 'name'));
  else
    update public.projects set
      name = btrim(p ->> 'name'), glyph = coalesce(btrim(p ->> 'glyph'), ''),
      subject_id = nullif(p ->> 'subject_id', ''), tag = coalesce(btrim(p ->> 'tag'), ''),
      description = btrim(p ->> 'description'), platforms = plats,
      landing_url = nullif(btrim(coalesce(p ->> 'landing_url', '')), '')
      where id = p_id returning id into saved;
    if saved is null then
      raise exception 'project not found' using errcode = 'PT404';
    end if;
    perform private.audit_site('project.update', 'project', saved::text, jsonb_build_object('name', p ->> 'name'));
  end if;

  update public.projects set
    tagline = btrim(coalesce(p ->> 'tagline', '')), intro = btrim(coalesce(p ->> 'intro', '')),
    reasons = coalesce(p -> 'reasons', '[]'), features = coalesce(p -> 'features', '[]'),
    steps = coalesce(p -> 'steps', '[]'), faq = coalesce(p -> 'faq', '[]'),
    downloads = dls, version = btrim(coalesce(p ->> 'version', '')),
    source_url = nullif(btrim(coalesce(p ->> 'source_url', '')), '')
    where id = saved;

  delete from public.project_screenshots where project_id = saved;
  insert into public.project_screenshots (project_id, position, media_id, caption, alt, widths, width, height)
    select saved, s.n, m.id, btrim(coalesce(s.v ->> 'caption', '')), coalesce(m.alt, ''), m.widths, m.width, m.height
    from jsonb_array_elements(shots) with ordinality as s(v, n)
    join public.media m on m.id = (s.v ->> 'media_id')::uuid;
  return saved;
end;
$$;
