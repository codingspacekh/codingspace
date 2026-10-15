-- M1 baseline schema: subjects, sections, posts, audit log. Deny by default (03 §7, §8).
-- Later milestones extend posts (levels, media, revisions…) with new migrations.

-- ── Private schema: never exposed through the API ─────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.owner (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
comment on table private.owner is 'The single admin account allowed to write content (03 ADM-01).';

-- True only for the owner, signed in with 2FA (AAL2).
create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) in (select user_id from private.owner)
    and (select auth.jwt() ->> 'aal') = 'aal2',
    false
  );
$$;
revoke all on function private.is_owner() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

-- ── Deny by default: remove Supabase's default grants on public ───────────
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- ── subjects (fixed set, seeded here) ─────────────────────────────────────
create table public.subjects (
  id text primary key check (id ~ '^[a-z]+$'),
  name text not null,
  glyph text not null default '',
  color text not null default 'cyan',
  intro text not null default '',
  sort smallint not null
);
insert into public.subjects (id, name, glyph, color, sort) values
  ('math', 'Math', '∑', 'cyan', 0),
  ('physics', 'Physics', 'Ψ', 'violet', 1),
  ('coding', 'Coding', '</>', 'amber', 2),
  ('it', 'IT', '⌘', 'lime', 3);

-- ── sections inside a subject ─────────────────────────────────────────────
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects (id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  sort integer not null default 0,
  unique (subject_id, slug)
);
create index sections_subject_sort on public.sections (subject_id, sort);

-- ── posts: draft fields (owner only) + live fields (public when published) ─
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lesson', 'life')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subject_id text references public.subjects (id),
  section_id uuid references public.sections (id) on delete restrict,
  sort integer not null default 0,
  lang text not null default 'en' check (lang in ('en', 'km')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  -- draft (working copy)
  title text not null default '',
  summary text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  -- live (what students see)
  live_title text,
  live_summary text,
  live_html text,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'life' or subject_id is not null),
  check (status <> 'published' or (live_title is not null and published_at is not null))
);
create index posts_section_sort on public.posts (section_id, sort) where status = 'published';

-- ── audit log: append-only record of admin actions ────────────────────────
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id text not null,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

-- ── Row-level security ────────────────────────────────────────────────────
alter table public.subjects enable row level security;
alter table public.sections enable row level security;
alter table public.posts enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.subjects, public.sections, public.posts, public.audit_events from anon, authenticated;

-- Public read: subjects, sections, and only the live columns of published posts.
grant select on public.subjects, public.sections to anon, authenticated;
grant select (id, kind, slug, subject_id, section_id, sort, lang, status,
              live_title, live_summary, live_html, published_at)
  on public.posts to anon;

create policy subjects_read on public.subjects for select to anon, authenticated using (true);
create policy sections_read on public.sections for select to anon, authenticated using (true);
create policy posts_read_published on public.posts for select to anon using (status = 'published');

-- Owner (with 2FA) can do everything. Subjects stay fixed (seeded by migration only).
grant select, insert, update, delete on public.sections, public.posts to authenticated;
grant select, insert on public.audit_events to authenticated;

create policy sections_owner on public.sections for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy posts_owner on public.posts for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy audit_owner_read on public.audit_events for select to authenticated
  using ((select private.is_owner()));
create policy audit_owner_append on public.audit_events for insert to authenticated
  with check ((select private.is_owner()));
-- No update/delete policies on audit_events: the log is append-only.

-- keep updated_at fresh
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger posts_touch before update on public.posts
  for each row execute function private.touch_updated_at();
