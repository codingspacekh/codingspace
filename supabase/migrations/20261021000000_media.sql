-- M4 media (03 ADM-10, D5, §8.4): uploaded images and files, and which posts use them.
--
-- The files themselves live in Cloudflare R2 (keys from the media id: i/<id>/<width>.<webp|avif>
-- for images, f/<id> for files); this table is their catalogue. Posts refer to media by id in
-- their content (image and file nodes: attrs.media), and post_media is kept in step with that
-- by a trigger, for the library's "used in" and "unused" views. A used file cannot be deleted.

create table public.media (
  id uuid primary key,
  kind text not null check (kind in ('image', 'file')),
  mime text not null check (mime ~ '^[a-z]+/[a-z0-9.+-]+$'),
  bytes bigint not null check (bytes between 1 and 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Images: the size after auto-rotation, and the variant widths stored in R2 (ascending).
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  widths integer[] not null default '{}',
  alt text not null default '' check (length(alt) <= 500),
  original_name text not null check (length(original_name) between 1 and 200),
  created_at timestamptz not null default now(),
  check (kind = 'file' or (width is not null and height is not null and cardinality(widths) between 1 and 4)),
  check (kind = 'image' or (width is null and height is null and cardinality(widths) = 0))
);
-- The same upload twice reuses the first copy.
create unique index media_sha256 on public.media (kind, sha256);
create index media_created on public.media (created_at desc);

create table public.post_media (
  post_id uuid not null references public.posts (id) on delete cascade,
  -- restrict: a file that a post uses cannot be deleted (03 ADM-10).
  media_id uuid not null references public.media (id) on delete restrict,
  in_draft boolean not null,
  in_live boolean not null,
  primary key (post_id, media_id),
  check (in_draft or in_live)
);
create index post_media_media on public.post_media (media_id);

-- ── Owner only: visitors never see the catalogue, only the rendered URLs ──
alter table public.media enable row level security;
alter table public.post_media enable row level security;
revoke all on public.media, public.post_media from anon, authenticated;
grant select, insert, update, delete on public.media to authenticated;
grant select on public.post_media to authenticated;

create policy media_owner on public.media for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy post_media_owner_read on public.post_media for select to authenticated
  using ((select private.is_owner()));
-- post_media is written only by the trigger below (security definer).

-- ── post_media follows the posts' content ─────────────────────────────────
-- Media ids in a content document: attrs.media of image and file nodes, at any depth.
create or replace function private.content_media_ids(p_doc jsonb)
returns uuid[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct v #>> '{}' order by v #>> '{}')::uuid[], '{}')
    from jsonb_path_query(p_doc, 'lax $.**.attrs.media ? (@.type() == "string")') v
    where v #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- The draft's media now; the live media as of the last publish (the draft at that moment).
create or replace function private.sync_post_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  draft_ids uuid[] := private.content_media_ids(new.content_json);
  live_ids uuid[];
begin
  if new.status <> 'published' then
    live_ids := '{}';
  elsif tg_op = 'INSERT' or new.live_revision is distinct from old.live_revision
        or old.status <> 'published' then
    live_ids := draft_ids;
  else
    select coalesce(array_agg(media_id), '{}') into live_ids
      from public.post_media where post_id = new.id and in_live;
  end if;

  delete from public.post_media where post_id = new.id;
  -- Ids that aren't in the catalogue (a typo, a deleted file) are left out: the renderer
  -- drops those nodes anyway, and they mustn't block saving.
  insert into public.post_media (post_id, media_id, in_draft, in_live)
    select new.id, m.id, m.id = any (draft_ids), m.id = any (live_ids)
    from public.media m
    where m.id = any (draft_ids) or m.id = any (live_ids);
  return null;
end;
$$;
revoke all on function private.content_media_ids(jsonb), private.sync_post_media() from public;
grant execute on function private.content_media_ids(jsonb) to authenticated, service_role;

create trigger posts_media after insert or update of content_json, status, live_revision on public.posts
  for each row execute function private.sync_post_media();

-- ── admin_media: the library (owner only, through RLS) ────────────────────
create view public.admin_media with (security_invoker = true) as
  select m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.widths, m.alt, m.original_name, m.created_at,
         (select count(*)::int from public.post_media pm where pm.media_id = m.id) as use_count
  from public.media m;
revoke all on public.admin_media from anon, authenticated;
grant select on public.admin_media to authenticated;

-- ── Changes: one function each, audited ───────────────────────────────────
create or replace function private.audit_media(p_action text, p_media uuid, p_meta jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.audit_events (action, entity, entity_id, meta) values (p_action, 'media', p_media::text, p_meta);
$$;
revoke all on function private.audit_media(text, uuid, jsonb) from public;
grant execute on function private.audit_media(text, uuid, jsonb) to authenticated;

-- Records a processed upload. The same file uploaded before → that one's id (and nothing new).
create or replace function public.admin_add_media(
  p_id uuid, p_kind text, p_mime text, p_bytes bigint, p_sha256 text, p_width integer, p_height integer,
  p_widths integer[], p_alt text, p_original_name text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  existing uuid;
begin
  select id into existing from public.media where kind = p_kind and sha256 = p_sha256;
  if found then
    return jsonb_build_object('id', existing, 'duplicate', true);
  end if;
  insert into public.media (id, kind, mime, bytes, sha256, width, height, widths, alt, original_name)
    values (p_id, p_kind, p_mime, p_bytes, p_sha256, p_width, p_height, coalesce(p_widths, '{}'),
            btrim(coalesce(p_alt, '')), btrim(p_original_name));
  perform private.audit_media('media.add', p_id,
    jsonb_build_object('kind', p_kind, 'name', btrim(p_original_name), 'bytes', p_bytes));
  return jsonb_build_object('id', p_id, 'duplicate', false);
end;
$$;

-- The library's default alt text (used when the image is inserted again) and display name.
create or replace function public.admin_update_media(p_id uuid, p_alt text, p_original_name text)
returns void language plpgsql set search_path = '' as $$
begin
  update public.media set alt = btrim(coalesce(p_alt, '')), original_name = btrim(p_original_name)
    where id = p_id;
  if not found then
    raise exception 'file not found' using errcode = 'PT404';
  end if;
  perform private.audit_media('media.update', p_id, jsonb_build_object('name', btrim(p_original_name)));
end;
$$;

-- Deletes the catalogue row; the caller then deletes the objects in R2. Refused while used.
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

revoke all on function public.admin_add_media(uuid, text, text, bigint, text, integer, integer, integer[], text, text),
  public.admin_update_media(uuid, text, text), public.admin_delete_media(uuid) from public, anon;
grant execute on function public.admin_add_media(uuid, text, text, bigint, text, integer, integer, integer[], text, text),
  public.admin_update_media(uuid, text, text), public.admin_delete_media(uuid) to authenticated;
