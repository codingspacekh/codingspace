-- v1.1 media folders (owner request 2026-10-18): group the library's files into folders, one
-- level deep. A file is in one folder or none ("Unsorted"). Deleting a folder never deletes
-- files: they go back to Unsorted. Additive: a new table, a nullable column, new functions.

create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80 and name = btrim(name)),
  created_at timestamptz not null default now()
);
-- Two folders can't share a name (whatever the case).
create unique index media_folders_name on public.media_folders (lower(name));

alter table public.media add column folder_id uuid references public.media_folders (id) on delete set null;
create index media_folder on public.media (folder_id, created_at desc);

-- ── Owner only, like the media catalogue ──────────────────────────────────
alter table public.media_folders enable row level security;
revoke all on public.media_folders from anon, authenticated;
grant select, insert, update, delete on public.media_folders to authenticated;
create policy media_folders_owner on public.media_folders for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- The library gains the folder (a new last column; the rest as in 20261102000000).
create or replace view public.admin_media with (security_invoker = true) as
  select m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.widths, m.alt, m.original_name, m.created_at,
         ((select count(*)::int from public.post_media pm where pm.media_id = m.id)
          + (select count(*)::int from public.profile pr where pr.photo_media_id = m.id)
          + (select count(*)::int from public.project_screenshots ps where ps.media_id = m.id)) as use_count,
         m.folder_id
  from public.media m;

-- Folders A–Z with how many files each holds.
create view public.admin_media_folders with (security_invoker = true) as
  select f.id, f.name, f.created_at,
         (select count(*)::int from public.media m where m.folder_id = f.id) as file_count
  from public.media_folders f;
revoke all on public.admin_media_folders from anon, authenticated;
grant select on public.admin_media_folders to authenticated;

-- ── Changes: one function each, audited ───────────────────────────────────
create or replace function private.audit_media_folder(p_action text, p_folder uuid, p_meta jsonb)
returns void language sql set search_path = '' as $$
  insert into public.audit_events (action, entity, entity_id, meta)
    values (p_action, 'media_folder', coalesce(p_folder::text, 'unsorted'), p_meta);
$$;
revoke all on function private.audit_media_folder(text, uuid, jsonb) from public;
grant execute on function private.audit_media_folder(text, uuid, jsonb) to authenticated;

-- A new folder (p_id null) or a new name for one. Returns its id.
create or replace function public.admin_save_media_folder(p_id uuid, p_name text)
returns uuid language plpgsql set search_path = '' as $$
declare
  clean text := btrim(coalesce(p_name, ''));
  saved uuid;
begin
  if length(clean) not between 1 and 80 then
    raise exception 'a folder name is 1 to 80 characters' using errcode = 'PT422';
  end if;
  if exists (select 1 from public.media_folders where lower(name) = lower(clean) and id is distinct from p_id) then
    raise exception 'there is already a folder called %', clean using errcode = 'PT409';
  end if;
  if p_id is null then
    insert into public.media_folders (name) values (clean) returning id into saved;
    perform private.audit_media_folder('media_folder.create', saved, jsonb_build_object('name', clean));
  else
    update public.media_folders set name = clean where id = p_id returning id into saved;
    if saved is null then
      raise exception 'folder not found' using errcode = 'PT404';
    end if;
    perform private.audit_media_folder('media_folder.update', saved, jsonb_build_object('name', clean));
  end if;
  return saved;
end;
$$;

-- Deletes a folder; its files go back to Unsorted (the foreign key sets them to null).
-- Returns how many files moved.
create or replace function public.admin_delete_media_folder(p_id uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  f public.media_folders;
  moved integer;
begin
  select * into f from public.media_folders where id = p_id for update;
  if not found then
    raise exception 'folder not found' using errcode = 'PT404';
  end if;
  select count(*)::int into moved from public.media where folder_id = p_id;
  delete from public.media_folders where id = p_id;
  perform private.audit_media_folder('media_folder.delete', p_id,
    jsonb_build_object('name', f.name, 'files', moved));
  return moved;
end;
$$;

-- Moves files into a folder (p_folder null: back to Unsorted). Returns how many moved.
create or replace function public.admin_move_media(p_ids uuid[], p_folder uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  target text;
  moved integer;
begin
  if coalesce(cardinality(p_ids), 0) not between 1 and 500 then
    raise exception 'move 1 to 500 files at a time' using errcode = 'PT422';
  end if;
  if p_folder is not null then
    select name into target from public.media_folders where id = p_folder;
    if not found then
      raise exception 'folder not found' using errcode = 'PT404';
    end if;
  end if;
  update public.media set folder_id = p_folder
    where id = any (p_ids) and folder_id is distinct from p_folder;
  get diagnostics moved = row_count;
  if moved > 0 then
    perform private.audit_media_folder('media.move', p_folder,
      jsonb_build_object('name', coalesce(target, 'Unsorted'), 'files', moved));
  end if;
  return moved;
end;
$$;

revoke all on function public.admin_save_media_folder(uuid, text), public.admin_delete_media_folder(uuid),
  public.admin_move_media(uuid[], uuid) from public, anon;
grant execute on function public.admin_save_media_folder(uuid, text), public.admin_delete_media_folder(uuid),
  public.admin_move_media(uuid[], uuid) to authenticated;
