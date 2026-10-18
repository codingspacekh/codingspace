-- The shape of the author's photo on the Author page (owner request 2026-10-18): the hexagon
-- it always had, or a circle, an octagon or a rectangle; chosen in the admin, and used for the
-- initials too when there is no photo. Additive: admin_save_author keeps the saved shape when
-- an older admin sends none, and author_page() only gains a key.

alter table public.profile
  add column photo_shape text not null default 'hexagon'
    constraint profile_photo_shape_check check (photo_shape in ('hexagon', 'circle', 'octagon', 'rectangle'));

-- ── Saving (the admin) ────────────────────────────────────────────────────
-- p: { profile: { name, bio, years, students, email, photo_media_id, photo_shape, hidden },
--      sections: [{ kind, title, visible, items: [{ title, subtitle, period, note, url, tags, visible }] }] }
-- in page order. Every built-in section exactly once; custom ones replace those there before.
create or replace function public.admin_save_author(p jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  pr jsonb := p -> 'profile';
  photo public.media;
  sec record;
  sid text;
begin
  if not private.is_owner() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'sections') is distinct from 'array' or jsonb_array_length(p -> 'sections') > 40 then
    raise exception 'sections must be a list of at most 40' using errcode = 'PT422';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'sections') s
             where coalesce(s ->> 'kind', '') not in ('timeline', 'experience', 'education', 'skills', 'awards',
                                                     'hobbies', 'life_posts', 'custom')) then
    raise exception 'unknown kind of section' using errcode = 'PT422';
  end if;
  if (select count(*) from jsonb_array_elements(p -> 'sections') s where s ->> 'kind' <> 'custom') <> 7
     or (select count(distinct s ->> 'kind') from jsonb_array_elements(p -> 'sections') s
         where s ->> 'kind' <> 'custom') <> 7 then
    raise exception 'every built-in section must be there once' using errcode = 'PT422';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'sections') s
             where jsonb_typeof(coalesce(s -> 'items', '[]')) <> 'array' or jsonb_array_length(coalesce(s -> 'items', '[]')) > 50
                or (s ->> 'kind' = 'life_posts' and jsonb_array_length(coalesce(s -> 'items', '[]')) > 0)) then
    raise exception 'a section has at most 50 items (life posts has none)' using errcode = 'PT422';
  end if;

  if nullif(pr ->> 'photo_media_id', '') is not null then
    select * into photo from public.media where id = (pr ->> 'photo_media_id')::uuid;
    if not found or photo.kind <> 'image' then
      raise exception 'the photo must be an image from the media library' using errcode = 'PT422';
    end if;
  end if;
  insert into public.profile (id, name, bio, years, students, email, hidden, photo_shape,
                              photo_media_id, photo_widths, photo_width, photo_height)
    values (true, btrim(pr ->> 'name'), btrim(coalesce(pr ->> 'bio', '')), (pr ->> 'years')::smallint,
            (pr ->> 'students')::integer, nullif(btrim(coalesce(pr ->> 'email', '')), ''),
            array(select distinct jsonb_array_elements_text(coalesce(pr -> 'hidden', '[]')) order by 1),
            coalesce(pr ->> 'photo_shape', 'hexagon'),
            photo.id, coalesce(photo.widths, '{}'), photo.width, photo.height)
    on conflict (id) do update set
      name = excluded.name, bio = excluded.bio, years = excluded.years, students = excluded.students,
      email = excluded.email, hidden = excluded.hidden, photo_media_id = excluded.photo_media_id,
      -- An admin from before this migration sends no shape: keep the one saved.
      photo_shape = case when pr ? 'photo_shape' then excluded.photo_shape else public.profile.photo_shape end,
      photo_widths = excluded.photo_widths, photo_width = excluded.photo_width, photo_height = excluded.photo_height;

  delete from public.author_items where true;
  delete from public.author_sections where kind = 'custom';
  for sec in select s, n::int as n from jsonb_array_elements(p -> 'sections') with ordinality as t(s, n) loop
    if sec.s ->> 'kind' = 'custom' then
      sid := gen_random_uuid()::text;
      insert into public.author_sections (id, kind, title, visible, sort)
        values (sid, 'custom', btrim(sec.s ->> 'title'), coalesce((sec.s ->> 'visible')::boolean, true), sec.n);
    else
      sid := sec.s ->> 'kind';
      update public.author_sections
        set title = btrim(sec.s ->> 'title'), visible = coalesce((sec.s ->> 'visible')::boolean, true), sort = sec.n
        where id = sid;
    end if;
    insert into public.author_items (section_id, visible, sort, title, subtitle, period, note, url, tags)
      select sid, coalesce((i ->> 'visible')::boolean, true), m::int, btrim(i ->> 'title'),
             btrim(coalesce(i ->> 'subtitle', '')), btrim(coalesce(i ->> 'period', '')),
             btrim(coalesce(i ->> 'note', '')), nullif(btrim(coalesce(i ->> 'url', '')), ''),
             array(select btrim(t) from jsonb_array_elements_text(coalesce(i -> 'tags', '[]')) t where btrim(t) <> '')
      from jsonb_array_elements(coalesce(sec.s -> 'items', '[]')) with ordinality as x(i, m);
  end loop;

  perform private.audit_site('author.update', 'profile', 'profile',
                             jsonb_build_object('sections', jsonb_array_length(p -> 'sections')));
end;
$$;
revoke all on function public.admin_save_author(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_author(jsonb) to authenticated;

-- ── Reading (visitors) ────────────────────────────────────────────────────
-- The whole page in one call: hidden facts are null, hidden sections and items left out.
create or replace function public.author_page()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'name', p.name,
        'bio', case when 'bio' = any(p.hidden) then '' else p.bio end,
        'years', case when 'years' = any(p.hidden) then null else p.years end,
        'students', case when 'students' = any(p.hidden) then null else p.students end,
        'email', case when 'email' = any(p.hidden) then null else p.email end,
        'photo', case when 'photo' = any(p.hidden) then null else p.photo_media_id end,
        'photo_widths', case when 'photo' = any(p.hidden) then '{}' else p.photo_widths end,
        'photo_width', case when 'photo' = any(p.hidden) then null else p.photo_width end,
        'photo_height', case when 'photo' = any(p.hidden) then null else p.photo_height end,
        'photo_shape', p.photo_shape)
      from public.profile p),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'kind', s.kind, 'title', s.title,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object('title', i.title, 'subtitle', i.subtitle, 'period', i.period,
                                                     'note', i.note, 'url', i.url, 'tags', to_jsonb(i.tags))
                                  order by i.sort, i.id)
                 from public.author_items i where i.section_id = s.id and i.visible), '[]'::jsonb))
             order by s.sort, s.id)
      from public.author_sections s where s.visible), '[]'::jsonb));
$$;
revoke all on function public.author_page() from public;
grant execute on function public.author_page() to anon, authenticated;
