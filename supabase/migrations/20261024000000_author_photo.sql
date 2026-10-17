-- The author's photo on the Author page (03 ADM-14, owner request): an image from the media
-- library. Visitors can't read the media catalogue (owner-only), so the variant widths and
-- size are copied onto the profile row when it is saved; the page builds the URLs from them.
-- An image used as the photo can't be deleted from the library.

alter table public.profile
  add column photo_media_id uuid references public.media (id) on delete restrict,
  add column photo_widths integer[] not null default '{}',
  add column photo_width integer check (photo_width between 1 and 20000),
  add column photo_height integer check (photo_height between 1 and 20000),
  add constraint profile_photo_complete check (
    (photo_media_id is null and cardinality(photo_widths) = 0 and photo_width is null and photo_height is null)
    or (photo_media_id is not null and cardinality(photo_widths) between 1 and 4
        and photo_width is not null and photo_height is not null));

-- p: { name, bio, years, students, email, photo_media_id }. A photo must be an image.
create or replace function public.admin_save_profile(p jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  photo public.media;
begin
  if nullif(p ->> 'photo_media_id', '') is not null then
    select * into photo from public.media where id = (p ->> 'photo_media_id')::uuid;
    if not found or photo.kind <> 'image' then
      raise exception 'the photo must be an image from the media library' using errcode = 'PT422';
    end if;
  end if;
  insert into public.profile (id, name, bio, years, students, email,
                              photo_media_id, photo_widths, photo_width, photo_height)
    values (true, btrim(p ->> 'name'), btrim(coalesce(p ->> 'bio', '')), (p ->> 'years')::smallint,
            (p ->> 'students')::integer, nullif(btrim(coalesce(p ->> 'email', '')), ''),
            photo.id, coalesce(photo.widths, '{}'), photo.width, photo.height)
    on conflict (id) do update set
      name = excluded.name, bio = excluded.bio, years = excluded.years, students = excluded.students,
      email = excluded.email, photo_media_id = excluded.photo_media_id, photo_widths = excluded.photo_widths,
      photo_width = excluded.photo_width, photo_height = excluded.photo_height;
  perform private.audit_site('profile.update', 'profile', 'profile',
                             jsonb_build_object('photo', photo.id is not null));
end;
$$;

drop view public.public_profile;
create view public.public_profile with (security_invoker = true) as
  select name, bio, years, students, email,
         photo_media_id as photo, photo_widths, photo_width, photo_height
  from public.profile;
revoke all on public.public_profile from anon, authenticated;
grant select on public.public_profile to anon, authenticated;

-- The library: the author photo counts as a use, and blocks deleting.
create or replace view public.admin_media with (security_invoker = true) as
  select m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.widths, m.alt, m.original_name, m.created_at,
         ((select count(*)::int from public.post_media pm where pm.media_id = m.id)
          + (select count(*)::int from public.profile pr where pr.photo_media_id = m.id)) as use_count
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
