-- The Author page in sections (03 ADM-14, owner request 2026-10-17): the header (photo, bio and
-- facts) plus timeline, experience, education, skills, awards, hobbies, life posts and any number
-- of custom sections. The owner orders the sections and their items and can hide any part of
-- the page except the name. Hidden parts never reach visitors: they read the page only through
-- author_page(), which leaves them out.
--
-- Additive: the old timeline table, its view and admin_save_profile/admin_save_timeline stay
-- until the app no longer uses them (removed in a later migration).

-- ── The header ────────────────────────────────────────────────────────────
-- The bio is Markdown now (rendered like the problem of the week), so it may be longer.
alter table public.profile
  add column hidden text[] not null default '{}',
  add constraint profile_hidden_check check (hidden <@ array['photo', 'bio', 'years', 'students', 'email']);
alter table public.profile drop constraint profile_bio_check;
alter table public.profile add constraint profile_bio_check check (length(bio) <= 5000);

-- ── Sections and their items ──────────────────────────────────────────────
-- A built-in section's id is its kind, so every database (and every export) agrees on it.
create table public.author_sections (
  id text primary key,
  kind text not null check (kind in ('timeline', 'experience', 'education', 'skills', 'awards', 'hobbies',
                                     'life_posts', 'custom')),
  title text not null check (length(title) between 1 and 80),
  visible boolean not null default true,
  sort integer not null default 0,
  check ((kind <> 'custom' and id = kind)
         or (kind = 'custom' and id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
comment on table public.author_sections is 'Sections of the Author page, in the owner''s order (03 ADM-14).';

-- Each kind uses some of the fields (src/lib/author.ts): title always; subtitle, period, note
-- (Markdown), url and tags where they make sense.
create table public.author_items (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references public.author_sections (id) on delete cascade,
  visible boolean not null default true,
  sort integer not null default 0,
  title text not null check (length(title) between 1 and 300),
  subtitle text not null default '' check (length(subtitle) <= 200),
  period text not null default '' check (length(period) <= 40),
  note text not null default '' check (length(note) <= 2000),
  url text check (url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^\s]*)?$'),
  tags text[] not null default '{}' check (cardinality(tags) <= 30 and length(array_to_string(tags, '')) <= 1200)
);
create index author_items_section on public.author_items (section_id, sort);

alter table public.author_sections enable row level security;
alter table public.author_items enable row level security;
revoke all on public.author_sections, public.author_items from anon, authenticated;
grant select, insert, update, delete on public.author_sections, public.author_items to authenticated;
create policy author_sections_owner on public.author_sections for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy author_items_owner on public.author_items for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- The page as it looks today: the timeline, then life posts; the new sections in between.
insert into public.author_sections (id, kind, title, sort) values
  ('timeline', 'timeline', 'Timeline', 1),
  ('experience', 'experience', 'Experience', 2),
  ('education', 'education', 'Education', 3),
  ('skills', 'skills', 'Skills', 4),
  ('awards', 'awards', 'Awards & certificates', 5),
  ('hobbies', 'hobbies', 'Hobbies & interests', 6),
  ('life_posts', 'life_posts', 'Life posts', 7);
insert into public.author_items (section_id, title, period, sort)
  select 'timeline', text, year::text, sort from public.timeline_items;

-- ── Saving (the admin) ────────────────────────────────────────────────────
-- p: { profile: { name, bio, years, students, email, photo_media_id, hidden },
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
  insert into public.profile (id, name, bio, years, students, email, hidden,
                              photo_media_id, photo_widths, photo_width, photo_height)
    values (true, btrim(pr ->> 'name'), btrim(coalesce(pr ->> 'bio', '')), (pr ->> 'years')::smallint,
            (pr ->> 'students')::integer, nullif(btrim(coalesce(pr ->> 'email', '')), ''),
            array(select distinct jsonb_array_elements_text(coalesce(pr -> 'hidden', '[]')) order by 1),
            photo.id, coalesce(photo.widths, '{}'), photo.width, photo.height)
    on conflict (id) do update set
      name = excluded.name, bio = excluded.bio, years = excluded.years, students = excluded.students,
      email = excluded.email, hidden = excluded.hidden, photo_media_id = excluded.photo_media_id,
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
        'photo_height', case when 'photo' = any(p.hidden) then null else p.photo_height end)
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
