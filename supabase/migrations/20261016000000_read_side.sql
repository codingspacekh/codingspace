-- M2 read side (03 §7): lesson metadata, projects, profile, featured problems, public views.
-- Pages read only through the public_* views. They run as the caller (security_invoker),
-- so RLS and column grants on the tables still apply underneath: two layers, not one.

-- ── posts: lesson metadata and the rest of the live (published) fields ─────
alter table public.posts
  add column level smallint not null default 1 check (level between 1 and 3),
  add column minutes smallint not null default 1 check (minutes between 1 and 600),
  add column problem_count smallint not null default 0 check (problem_count between 0 and 500),
  add column live_toc jsonb not null default '[]'::jsonb,
  add column live_search_text text not null default '',
  add column live_has_math boolean not null default false,
  add column live_has_code boolean not null default false,
  add column live_updated_at timestamptz,
  -- 'simple' (no stemming) because posts are English or Khmer.
  add column live_search tsvector generated always as (
    to_tsvector('simple', coalesce(live_title, '') || ' ' || coalesce(live_summary, '') || ' ' || live_search_text)
  ) stored;

create index posts_live_search on public.posts using gin (live_search) where status = 'published';

grant select (level, minutes, problem_count, live_toc, live_search, live_has_math, live_has_code,
              live_updated_at)
  on public.posts to anon;

-- ── projects: cards that link to each project's own landing page ──────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 80),
  glyph text not null default '',
  subject_id text references public.subjects (id),
  tag text not null default '',
  description text not null check (length(description) between 1 and 500),
  platforms text[] not null default '{}',
  landing_url text not null check (landing_url ~ '^https://[^\s/$.?#][^\s]*$'),
  is_featured boolean not null default false,
  sort integer not null default 0
);
create unique index projects_one_featured on public.projects (is_featured) where is_featured;

-- ── profile (single row) and timeline, for the Author page ────────────────
create table public.profile (
  id boolean primary key default true check (id),
  name text not null,
  bio text not null default '',
  years smallint check (years >= 0),
  students integer check (students >= 0),
  email text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table public.timeline_items (
  id uuid primary key default gen_random_uuid(),
  year smallint not null check (year between 1900 and 2200),
  text text not null check (length(text) between 1 and 300),
  sort integer not null default 0
);

-- ── featured problems: one current "problem of the week" per subject ──────
create table public.featured_problems (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects (id),
  section_id uuid references public.sections (id) on delete set null,
  week_of date not null,
  statement text not null check (length(statement) between 1 and 4000),
  hint text not null default '',
  solution text not null default '',
  is_current boolean not null default false
);
create unique index featured_problems_one_current on public.featured_problems (subject_id) where is_current;

-- ── Row-level security for the new tables ─────────────────────────────────
alter table public.projects enable row level security;
alter table public.profile enable row level security;
alter table public.timeline_items enable row level security;
alter table public.featured_problems enable row level security;

revoke all on public.projects, public.profile, public.timeline_items, public.featured_problems
  from anon, authenticated;

grant select on public.projects, public.profile, public.timeline_items, public.featured_problems to anon;
create policy projects_read on public.projects for select to anon using (true);
create policy profile_read on public.profile for select to anon using (true);
create policy timeline_read on public.timeline_items for select to anon using (true);
-- Past problems (and their solutions) stay private until reused.
create policy featured_read_current on public.featured_problems for select to anon using (is_current);

grant select, insert, update, delete
  on public.projects, public.profile, public.timeline_items, public.featured_problems to authenticated;
create policy projects_owner on public.projects for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy profile_owner on public.profile for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy timeline_owner on public.timeline_items for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy featured_owner on public.featured_problems for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── Public views: the only shape pages read ───────────────────────────────
create view public.public_posts with (security_invoker = true) as
  select id, kind, slug, subject_id, section_id, sort, level, minutes, problem_count, lang,
         live_title as title, live_summary as summary, live_html as html, live_toc as toc,
         live_has_math as has_math, live_has_code as has_code, live_search as search,
         published_at, coalesce(live_updated_at, published_at) as updated_at
  from public.posts
  where status = 'published';

create view public.public_sections with (security_invoker = true) as
  select s.id, s.subject_id, s.slug, s.title, s.description, s.sort,
         (select count(*)::int from public.posts p
           where p.section_id = s.id and p.kind = 'lesson' and p.status = 'published') as lesson_count
  from public.sections s;

create view public.public_projects with (security_invoker = true) as
  select slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, sort
  from public.projects;

create view public.public_profile with (security_invoker = true) as
  select name, bio, years, students, email from public.profile;

create view public.public_timeline with (security_invoker = true) as
  select year, text, sort from public.timeline_items;

create view public.public_featured_problems with (security_invoker = true) as
  select f.id, f.subject_id, f.section_id, f.week_of, f.statement, f.hint, f.solution
  from public.featured_problems f
  where f.is_current;

-- Views are read-only for everyone except the owner's own privileges on the tables.
revoke all on public.public_posts, public.public_sections, public.public_projects,
  public.public_profile, public.public_timeline, public.public_featured_problems
  from anon, authenticated;
grant select on public.public_posts, public.public_sections, public.public_projects,
  public.public_profile, public.public_timeline, public.public_featured_problems
  to anon, authenticated;
