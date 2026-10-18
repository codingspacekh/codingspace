-- v1.1 lesson series across subjects (04 "After launch", 01 FR-03): a named, ordered list of
-- lessons the owner picks from any subject (e.g. "9618 Paper 1", "Maths for Physics").
-- Visitors see a series' page and, on each lesson in it, "Part n of N" with previous/next.
-- Only published lessons ever show; a draft in a series appears once it is published.
-- Changes go through audited admin_* functions (security invoker: RLS lets only the owner).

create table public.series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  sort integer not null default 0
);

create table public.series_lessons (
  series_id uuid not null references public.series (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  position integer not null check (position >= 1),
  primary key (series_id, post_id),
  unique (series_id, position)
);
create index series_lessons_post on public.series_lessons (post_id);

alter table public.series enable row level security;
alter table public.series_lessons enable row level security;
revoke all on public.series, public.series_lessons from anon, authenticated;

grant select on public.series, public.series_lessons to anon;
create policy series_read on public.series for select to anon using (true);
-- A draft's place in a series stays private (posts' own RLS shows anon published posts only).
create policy series_lessons_read on public.series_lessons for select to anon
  using (exists (select 1 from public.posts p where p.id = post_id));

grant select, insert, update, delete on public.series, public.series_lessons to authenticated;
create policy series_owner on public.series for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy series_lessons_owner on public.series_lessons for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── Public views ──────────────────────────────────────────────────────────
-- The published lessons of each series, numbered 1..n without the gaps drafts leave.
create view public.public_series_lessons with (security_invoker = true) as
  select sl.series_id,
         (row_number() over (partition by sl.series_id order by sl.position))::int as position,
         p.slug, p.title, p.summary, p.subject_id, p.level, p.minutes, p.lang, p.published_at
  from public.series_lessons sl
  join public.public_posts p on p.id = sl.post_id
  where p.kind = 'lesson';

create view public.public_series with (security_invoker = true) as
  select s.id, s.slug, s.title, s.description, s.sort,
         (select count(*)::int from public.public_series_lessons l where l.series_id = s.id) as lesson_count
  from public.series s;

revoke all on public.public_series, public.public_series_lessons from anon, authenticated;
grant select on public.public_series, public.public_series_lessons to anon, authenticated;

-- ── Admin ─────────────────────────────────────────────────────────────────
-- p: { slug (new only), title, description, post_ids: [lesson ids in order] }. The lessons are
-- replaced as a whole. A new series goes last. Returns its id.
create or replace function public.admin_save_series(p_id uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  ids uuid[];
begin
  if jsonb_typeof(p -> 'post_ids') is distinct from 'array' then
    raise exception 'post_ids must be a list' using errcode = 'PT422';
  end if;
  select coalesce(array_agg(x::uuid order by n), '{}') into ids
    from jsonb_array_elements_text(p -> 'post_ids') with ordinality as t(x, n);
  if cardinality(ids) > 100 then
    raise exception 'a series holds at most 100 lessons' using errcode = 'PT422';
  end if;
  if cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
    raise exception 'a lesson can be in a series only once' using errcode = 'PT422';
  end if;
  if cardinality(ids) <> (select count(*) from public.posts where id = any (ids) and kind = 'lesson') then
    raise exception 'only lessons can be in a series' using errcode = 'PT422';
  end if;

  if p_id is null then
    insert into public.series (slug, title, description, sort)
      values (p ->> 'slug', btrim(p ->> 'title'), btrim(coalesce(p ->> 'description', '')),
              coalesce((select max(sort) from public.series), 0) + 1)
      returning id into saved;
    perform private.audit_site('series.create', 'series', saved::text, jsonb_build_object('title', p ->> 'title'));
  else
    update public.series set title = btrim(p ->> 'title'), description = btrim(coalesce(p ->> 'description', ''))
      where id = p_id returning id into saved;
    if saved is null then
      raise exception 'series not found' using errcode = 'PT404';
    end if;
    perform private.audit_site('series.update', 'series', saved::text, jsonb_build_object('title', p ->> 'title'));
  end if;

  delete from public.series_lessons where series_id = saved;
  insert into public.series_lessons (series_id, post_id, position)
    select saved, x, n from unnest(ids) with ordinality as t(x, n);
  return saved;
end;
$$;

create or replace function public.admin_delete_series(p_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  gone public.series;
begin
  delete from public.series where id = p_id returning * into gone;
  if gone.id is null then
    raise exception 'series not found' using errcode = 'PT404';
  end if;
  update public.series t set sort = o.n
    from (select id, row_number() over (order by sort, title) as n from public.series) o where t.id = o.id;
  perform private.audit_site('series.delete', 'series', p_id::text, jsonb_build_object('title', gone.title));
end;
$$;

-- p_ids: every series, in the new order.
create or replace function public.admin_reorder_series(p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare
  have uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into have from (select id from public.series for update) s;
  if cardinality(p_ids) <> cardinality(have)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from have then
    raise exception 'the new order must list every series exactly once' using errcode = 'PT422';
  end if;
  update public.series t set sort = o.n from unnest(p_ids) with ordinality as o(id, n) where t.id = o.id;
  perform private.audit_site('series.reorder', 'series', '', jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

revoke all on function public.admin_save_series(uuid, jsonb), public.admin_delete_series(uuid),
  public.admin_reorder_series(uuid[]) from public;
grant execute on function public.admin_save_series(uuid, jsonb), public.admin_delete_series(uuid),
  public.admin_reorder_series(uuid[]) to authenticated;

-- The activity log names a series by its current title, like the other items.
create or replace view public.admin_activity_events with (security_invoker = true) as
  select e.id, e.action, e.entity, e.entity_id, e.meta, e.at,
         nullif(coalesce(p.title, s.title, m.original_name, j.name, r.title), '') as name
  from public.audit_events e
  left join public.posts p on e.entity = 'post' and p.id::text = e.entity_id
  left join public.sections s on e.entity = 'section' and s.id::text = e.entity_id
  left join public.media m on e.entity = 'media' and m.id::text = e.entity_id
  left join public.projects j on e.entity = 'project' and j.id::text = e.entity_id
  left join public.series r on e.entity = 'series' and r.id::text = e.entity_id;
