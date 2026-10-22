-- "Coming soon" is the owner's choice (owner request 2026-10-23), no longer every project without a
-- download: a website, for one, has nothing to download and is out already. The tag shows on the
-- card and the page only while the project has no download.
-- Projects that say "Coming soon" today keep it: no downloads, and the Download section not hidden.

alter table public.projects add column coming_soon boolean not null default false;
update public.projects set coming_soon = true
  where downloads = '[]'::jsonb and not ('download' = any (hidden_sections));

-- ── Public view (the new column goes last) ────────────────────────────────
create or replace view public.public_projects with (security_invoker = true) as
  select slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, sort,
         tagline, intro, reasons, features, steps, faq, downloads, version, source_url, id,
         highlights, why_title, why_text, replaces, requirements, requirements_note, release_date, release_notes,
         section_order, hidden_sections, coming_soon
  from public.projects;

-- ── Saving a project: as in 20261109000000, plus coming_soon ──────────────
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
    hidden_sections = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'hidden_sections') x), '{}'),
    coming_soon = coalesce((p ->> 'coming_soon')::boolean, false)
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
