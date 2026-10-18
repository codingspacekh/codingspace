-- v1.1 project pages (owner request 2026-10-18): each project gets its own landing page on our
-- site, /projects/<slug>, instead of a card that sends visitors to another website. One fixed
-- layout; a section with nothing in it doesn't show:
--   hero (name, tagline, intro, download button) · screenshots · reasons · features ·
--   getting started (steps) · FAQ · downloads (version + links the owner pastes, e.g. GitHub
--   Releases; none yet = "Coming soon").
-- The external landing page becomes an optional "Website" link; a source code link is added.

alter table public.projects alter column landing_url drop not null;
alter table public.projects
  add column tagline text not null default '' check (length(tagline) <= 160),
  -- Markdown, rendered when the page is built (like the Author bio).
  add column intro text not null default '' check (length(intro) <= 3000),
  -- [{ title, text }]
  add column reasons jsonb not null default '[]'
    check (jsonb_typeof(reasons) = 'array' and jsonb_array_length(reasons) <= 8),
  -- [{ glyph, title, text }]
  add column features jsonb not null default '[]'
    check (jsonb_typeof(features) = 'array' and jsonb_array_length(features) <= 12),
  -- [{ title, text }]
  add column steps jsonb not null default '[]'
    check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 8),
  -- [{ question, answer (Markdown) }]
  add column faq jsonb not null default '[]'
    check (jsonb_typeof(faq) = 'array' and jsonb_array_length(faq) <= 12),
  -- [{ label, url }]: one button each, e.g. "Windows" → the .exe on GitHub Releases.
  add column downloads jsonb not null default '[]'
    check (jsonb_typeof(downloads) = 'array' and jsonb_array_length(downloads) <= 8),
  add column version text not null default '' check (length(version) <= 30),
  add column source_url text
    check (source_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^\s]*)?$'
           and length(source_url) <= 500);

-- ── Screenshots: images from the media library, in order ──────────────────
-- Visitors can't read the media catalogue (owner-only), so each image's variant widths, size
-- and alt text are copied here when the project is saved, like the Author photo.
create table public.project_screenshots (
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null check (position between 1 and 8),
  media_id uuid not null references public.media (id) on delete restrict,
  caption text not null default '' check (length(caption) <= 200),
  alt text not null default '' check (length(alt) <= 500),
  widths integer[] not null check (cardinality(widths) between 1 and 4),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  primary key (project_id, position),
  unique (project_id, media_id)
);
create index project_screenshots_media on public.project_screenshots (media_id);

alter table public.project_screenshots enable row level security;
revoke all on public.project_screenshots from anon, authenticated;
grant select on public.project_screenshots to anon;
create policy project_screenshots_read on public.project_screenshots for select to anon using (true);
grant select, insert, update, delete on public.project_screenshots to authenticated;
create policy project_screenshots_owner on public.project_screenshots for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── Public views ──────────────────────────────────────────────────────────
create or replace view public.public_projects with (security_invoker = true) as
  select slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, sort,
         tagline, intro, reasons, features, steps, faq, downloads, version, source_url, id
  from public.projects;

create view public.public_project_screenshots with (security_invoker = true) as
  select project_id, position, media_id as media, caption, alt, widths, width, height
  from public.project_screenshots;
revoke all on public.public_project_screenshots from anon, authenticated;
grant select on public.public_project_screenshots to anon, authenticated;

-- ── Admin ─────────────────────────────────────────────────────────────────
-- p: { slug (new only), name, glyph, subject_id, tag, description, platforms, landing_url,
--      tagline, intro, reasons, features, steps, faq, downloads, version, source_url,
--      screenshots: [{ media_id, caption }] }. The server checks each list's items; the
-- screenshots are replaced as a whole. A new project goes last. Returns its id.
create or replace function public.admin_save_project(p_id uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  plats text[] := coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'platforms') x
                            where btrim(x) <> ''), '{}');
  shots jsonb := coalesce(p -> 'screenshots', '[]');
begin
  if jsonb_typeof(shots) <> 'array' or jsonb_array_length(shots) > 8 then
    raise exception 'at most 8 screenshots' using errcode = 'PT422';
  end if;
  if exists (select 1 from jsonb_array_elements(shots) s
               left join public.media m on m.id = (s ->> 'media_id')::uuid
              where m.id is null or m.kind <> 'image') then
    raise exception 'screenshots must be images from the media library' using errcode = 'PT422';
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
    downloads = coalesce(p -> 'downloads', '[]'), version = btrim(coalesce(p ->> 'version', '')),
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

-- ── The media library: a screenshot counts as a use, and blocks deleting ──
create or replace view public.admin_media with (security_invoker = true) as
  select m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.widths, m.alt, m.original_name, m.created_at,
         ((select count(*)::int from public.post_media pm where pm.media_id = m.id)
          + (select count(*)::int from public.profile pr where pr.photo_media_id = m.id)
          + (select count(*)::int from public.project_screenshots ps where ps.media_id = m.id)) as use_count
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
