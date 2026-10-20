-- The project landing page, redesigned (owner approved the prototype 2026-10-20): more sections,
-- each of which the owner can hide or move. Part 2 of 2 (part 1: 20261108000000_app_downloads).
--
--   numbers       up to 4 big facts under the hero: [{ value, label }]
--   why           a heading and text, a "Before" list (replaces: [{ name, note }]), and the reasons as "Now"
--   showcase      up to 6 rows of screenshot + label, title, text and points [{ code, text }]
--   requirements  a table: [{ part, minimum, recommended }], with a note above it
--   download      + release date and release notes (one change per line)
--   install       the steps; a step may name its computer (steps[].platform), shown as tabs
-- section_order lists the sections in the owner's order (missing ones go last, in the default
-- order); hidden_sections are left out even when filled. Additive: older code ignores all this.

alter table public.projects
  add column highlights jsonb not null default '[]'
    check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 4),
  add column why_title text not null default '' check (length(why_title) <= 120),
  add column why_text text not null default '' check (length(why_text) <= 600),
  add column replaces jsonb not null default '[]'
    check (jsonb_typeof(replaces) = 'array' and jsonb_array_length(replaces) <= 8),
  add column requirements jsonb not null default '[]'
    check (jsonb_typeof(requirements) = 'array' and jsonb_array_length(requirements) <= 10),
  add column requirements_note text not null default '' check (length(requirements_note) <= 300),
  add column release_date date,
  add column release_notes text not null default '' check (length(release_notes) <= 2000),
  add column section_order text[] not null default '{}'
    check (section_order <@ array['numbers', 'why', 'showcase', 'features', 'screenshots', 'requirements',
                                  'download', 'install', 'faq']),
  add column hidden_sections text[] not null default '{}'
    check (hidden_sections <@ array['numbers', 'why', 'showcase', 'features', 'screenshots', 'requirements',
                                    'download', 'install', 'faq']);

-- Install steps for two computers need more room: 12 (was 8).
alter table public.projects drop constraint projects_steps_check;
alter table public.projects add constraint projects_steps_check
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12);

-- ── Showcase rows: an image from the media library each, copied like screenshots ──
create table public.project_showcase (
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null check (position between 1 and 6),
  media_id uuid not null references public.media (id) on delete restrict,
  label text not null default '' check (length(label) <= 60),
  title text not null check (length(title) between 1 and 120),
  text text not null default '' check (length(text) <= 600),
  points jsonb not null default '[]' check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) <= 6),
  color text not null default ''
    check (color in ('', 'cyan', 'violet', 'amber', 'lime', 'pink', 'orange', 'sky', 'rose', 'gold')),
  alt text not null default '' check (length(alt) <= 500),
  widths integer[] not null check (cardinality(widths) between 1 and 4),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  primary key (project_id, position)
);
create index project_showcase_media on public.project_showcase (media_id);

alter table public.project_showcase enable row level security;
revoke all on public.project_showcase from anon, authenticated;
grant select on public.project_showcase to anon;
create policy project_showcase_read on public.project_showcase for select to anon using (true);
grant select, insert, update, delete on public.project_showcase to authenticated;
create policy project_showcase_owner on public.project_showcase for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── Public views (new columns go last) ────────────────────────────────────
create or replace view public.public_projects with (security_invoker = true) as
  select slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, sort,
         tagline, intro, reasons, features, steps, faq, downloads, version, source_url, id,
         highlights, why_title, why_text, replaces, requirements, requirements_note, release_date, release_notes,
         section_order, hidden_sections
  from public.projects;

create view public.public_project_showcase with (security_invoker = true) as
  select project_id, position, media_id as media, label, title, text, points, color, alt, widths, width, height
  from public.project_showcase;
revoke all on public.public_project_showcase from anon, authenticated;
grant select on public.public_project_showcase to anon, authenticated;

-- ── The library: a showcase image counts as a use (as in 20261108000000, plus showcase) ──
create or replace view public.admin_media with (security_invoker = true) as
  select m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.widths, m.alt, m.original_name, m.created_at,
         ((select count(*)::int from public.post_media pm where pm.media_id = m.id)
          + (select count(*)::int from public.profile pr where pr.photo_media_id = m.id)
          + (select count(*)::int from public.project_screenshots ps where ps.media_id = m.id)
          + (select count(*)::int from public.project_showcase sc where sc.media_id = m.id)
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
    from (select project_id from public.project_screenshots where media_id = p_id
          union select project_id from public.project_showcase where media_id = p_id) s
    join public.projects j on j.id = s.project_id;
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

-- ── Saving a project: as in 20261108000000, plus the new fields and the showcase ──
-- p.showcase: [{ media_id, label, title, text, points, color }], replaced as a whole like the
-- screenshots. The server checks every field; the database checks the limits again.
create or replace function public.admin_save_project(p_id uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  plats text[] := coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'platforms') x
                            where btrim(x) <> ''), '{}');
  shots jsonb := coalesce(p -> 'screenshots', '[]');
  showcase jsonb := coalesce(p -> 'showcase', '[]');
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
  if jsonb_typeof(showcase) <> 'array' or jsonb_array_length(showcase) > 6 then
    raise exception 'at most 6 showcase rows' using errcode = 'PT422';
  end if;
  if exists (select 1 from jsonb_array_elements(showcase) s
               left join public.media m on m.id = (s ->> 'media_id')::uuid
              where m.id is null or m.kind <> 'image') then
    raise exception 'showcase images must be images from the media library' using errcode = 'PT422';
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
    source_url = nullif(btrim(coalesce(p ->> 'source_url', '')), ''),
    highlights = coalesce(p -> 'highlights', '[]'),
    why_title = btrim(coalesce(p ->> 'why_title', '')), why_text = btrim(coalesce(p ->> 'why_text', '')),
    replaces = coalesce(p -> 'replaces', '[]'), requirements = coalesce(p -> 'requirements', '[]'),
    requirements_note = btrim(coalesce(p ->> 'requirements_note', '')),
    release_date = nullif(p ->> 'release_date', '')::date,
    release_notes = btrim(coalesce(p ->> 'release_notes', '')),
    section_order = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'section_order') x), '{}'),
    hidden_sections = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'hidden_sections') x), '{}')
    where id = saved;

  delete from public.project_screenshots where project_id = saved;
  insert into public.project_screenshots (project_id, position, media_id, caption, alt, widths, width, height)
    select saved, s.n, m.id, btrim(coalesce(s.v ->> 'caption', '')), coalesce(m.alt, ''), m.widths, m.width, m.height
    from jsonb_array_elements(shots) with ordinality as s(v, n)
    join public.media m on m.id = (s.v ->> 'media_id')::uuid;

  delete from public.project_showcase where project_id = saved;
  insert into public.project_showcase (project_id, position, media_id, label, title, text, points, color,
                                       alt, widths, width, height)
    select saved, s.n, m.id, btrim(coalesce(s.v ->> 'label', '')), btrim(s.v ->> 'title'),
           btrim(coalesce(s.v ->> 'text', '')), coalesce(s.v -> 'points', '[]'), coalesce(s.v ->> 'color', ''),
           coalesce(m.alt, ''), m.widths, m.width, m.height
    from jsonb_array_elements(showcase) with ordinality as s(v, n)
    join public.media m on m.id = (s.v ->> 'media_id')::uuid;
  return saved;
end;
$$;
