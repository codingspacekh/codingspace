-- v1.1 syllabus tags (owner request 2026-10-18): the owner builds each syllabus they teach in the
-- admin (e.g. "Computer Science 9618" with points "1.1 Data representation", …) and tags lessons
-- with its points. Visitors get /syllabus/<slug>: every point in order with the lessons that cover
-- it, and each lesson shows its points. Only published lessons ever show (posts' own RLS).
-- Tags take effect at once (like a lesson's place in a series), not on the next publish.

create table public.syllabuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  -- Short label shown on tags, e.g. "9618".
  code text not null check (length(btrim(code)) between 1 and 20),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  subject_id text references public.subjects (id) on delete set null,
  sort integer not null default 0
);

create table public.syllabus_points (
  id uuid primary key default gen_random_uuid(),
  syllabus_id uuid not null references public.syllabuses (id) on delete cascade,
  -- As in the syllabus document, e.g. "1.1" or "4.2.3".
  code text not null check (length(btrim(code)) between 1 and 20),
  title text not null check (length(btrim(title)) between 1 and 160),
  sort integer not null,
  unique (syllabus_id, code)
);
create index syllabus_points_order on public.syllabus_points (syllabus_id, sort);

create table public.post_syllabus (
  post_id uuid not null references public.posts (id) on delete cascade,
  point_id uuid not null references public.syllabus_points (id) on delete cascade,
  primary key (post_id, point_id)
);
create index post_syllabus_point on public.post_syllabus (point_id);

alter table public.syllabuses enable row level security;
alter table public.syllabus_points enable row level security;
alter table public.post_syllabus enable row level security;
revoke all on public.syllabuses, public.syllabus_points, public.post_syllabus from anon, authenticated;

grant select on public.syllabuses, public.syllabus_points, public.post_syllabus to anon;
create policy syllabuses_read on public.syllabuses for select to anon using (true);
create policy syllabus_points_read on public.syllabus_points for select to anon using (true);
-- A draft's tags stay private (posts' own RLS shows anon published lessons in shown subjects only).
create policy post_syllabus_read on public.post_syllabus for select to anon
  using (exists (select 1 from public.posts p where p.id = post_id));

grant select, insert, update, delete on public.syllabuses, public.syllabus_points, public.post_syllabus
  to authenticated;
create policy syllabuses_owner on public.syllabuses for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy syllabus_points_owner on public.syllabus_points for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy post_syllabus_owner on public.post_syllabus for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── Public views ──────────────────────────────────────────────────────────
-- Each published lesson's points, with its syllabus (lesson pages, syllabus pages).
create view public.public_syllabus_lessons with (security_invoker = true) as
  select ps.point_id, pt.syllabus_id, pt.code as point_code, pt.title as point_title, pt.sort as point_sort,
         s.slug as syllabus_slug, s.code as syllabus_code,
         p.slug, p.title, p.summary, p.subject_id, p.level, p.minutes, p.lang, p.published_at
  from public.post_syllabus ps
  join public.syllabus_points pt on pt.id = ps.point_id
  join public.syllabuses s on s.id = pt.syllabus_id
  join public.public_posts p on p.id = ps.post_id
  where p.kind = 'lesson';
revoke all on public.public_syllabus_lessons from anon, authenticated;
grant select on public.public_syllabus_lessons to anon, authenticated;

-- ── Admin ─────────────────────────────────────────────────────────────────
-- p: { slug (new only), code, title, description, subject_id }. A new syllabus goes last.
create or replace function public.admin_save_syllabus(p_id uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
begin
  if p_id is null then
    insert into public.syllabuses (slug, code, title, description, subject_id, sort)
      values (p ->> 'slug', btrim(p ->> 'code'), btrim(p ->> 'title'), btrim(coalesce(p ->> 'description', '')),
              nullif(p ->> 'subject_id', ''), coalesce((select max(sort) from public.syllabuses), 0) + 1)
      returning id into saved;
    perform private.audit_site('syllabus.create', 'syllabus', saved::text, jsonb_build_object('title', p ->> 'title'));
  else
    update public.syllabuses set code = btrim(p ->> 'code'), title = btrim(p ->> 'title'),
           description = btrim(coalesce(p ->> 'description', '')), subject_id = nullif(p ->> 'subject_id', '')
      where id = p_id returning id into saved;
    if saved is null then
      raise exception 'syllabus not found' using errcode = 'PT404';
    end if;
    perform private.audit_site('syllabus.update', 'syllabus', saved::text, jsonb_build_object('title', p ->> 'title'));
  end if;
  return saved;
end;
$$;

-- p: [{ id (existing points only), code, title }] in order: the syllabus's whole list. Points
-- left out are deleted (with their tags); kept ones keep their id, so lessons stay tagged.
create or replace function public.admin_save_syllabus_points(p_syllabus uuid, p jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.syllabuses where id = p_syllabus) then
    raise exception 'syllabus not found' using errcode = 'PT404';
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 300 then
    raise exception 'a syllabus holds at most 300 points' using errcode = 'PT422';
  end if;
  if exists (select 1 from jsonb_array_elements(p) x
              where (x ->> 'id') is not null and not exists (select 1 from public.syllabus_points
                                               where id = (x ->> 'id')::uuid and syllabus_id = p_syllabus)) then
    raise exception 'a point belongs to another syllabus' using errcode = 'PT422';
  end if;
  if (select count(distinct lower(btrim(x ->> 'code'))) from jsonb_array_elements(p) x) <> jsonb_array_length(p) then
    raise exception 'each point needs its own code' using errcode = 'PT422';
  end if;

  delete from public.syllabus_points
    where syllabus_id = p_syllabus
      and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p) x where (x ->> 'id') is not null);
  -- Codes are unique: move the kept ones out of the way first, so two can swap codes.
  update public.syllabus_points set code = '~' || left(id::text, 18) where syllabus_id = p_syllabus;
  update public.syllabus_points t set code = btrim(x.v ->> 'code'), title = btrim(x.v ->> 'title'), sort = x.n
    from jsonb_array_elements(p) with ordinality as x(v, n)
    where (x.v ->> 'id') is not null and t.id = (x.v ->> 'id')::uuid;
  insert into public.syllabus_points (syllabus_id, code, title, sort)
    select p_syllabus, btrim(x.v ->> 'code'), btrim(x.v ->> 'title'), x.n
    from jsonb_array_elements(p) with ordinality as x(v, n)
    where (x.v ->> 'id') is null;
  perform private.audit_site('syllabus.points', 'syllabus', p_syllabus::text,
                             jsonb_build_object('points', jsonb_array_length(p)));
end;
$$;

create or replace function public.admin_delete_syllabus(p_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  gone public.syllabuses;
begin
  delete from public.syllabuses where id = p_id returning * into gone;
  if gone.id is null then
    raise exception 'syllabus not found' using errcode = 'PT404';
  end if;
  update public.syllabuses t set sort = o.n
    from (select id, row_number() over (order by sort, title) as n from public.syllabuses) o where t.id = o.id;
  perform private.audit_site('syllabus.delete', 'syllabus', p_id::text, jsonb_build_object('title', gone.title));
end;
$$;

-- p_ids: every syllabus, in the new order.
create or replace function public.admin_reorder_syllabuses(p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare
  have uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into have from (select id from public.syllabuses for update) s;
  if cardinality(p_ids) <> cardinality(have)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from have then
    raise exception 'the new order must list every syllabus exactly once' using errcode = 'PT422';
  end if;
  update public.syllabuses t set sort = o.n from unnest(p_ids) with ordinality as o(id, n) where t.id = o.id;
  perform private.audit_site('syllabus.reorder', 'syllabus', '', jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- A lesson's points, replaced as a whole. Life posts can't be tagged.
create or replace function public.admin_set_post_syllabus(p_post uuid, p_points uuid[])
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.posts where id = p_post and kind = 'lesson') then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;
  if cardinality(p_points) > 30 then
    raise exception 'a lesson can have at most 30 syllabus points' using errcode = 'PT422';
  end if;
  if cardinality(p_points) <> (select count(*) from public.syllabus_points where id = any (p_points)) then
    raise exception 'unknown syllabus point' using errcode = 'PT422';
  end if;
  delete from public.post_syllabus where post_id = p_post;
  insert into public.post_syllabus (post_id, point_id) select p_post, x from unnest(p_points) x on conflict do nothing;
  perform private.audit_site('post.syllabus', 'post', p_post::text, jsonb_build_object('points', cardinality(p_points)));
end;
$$;

revoke all on function public.admin_save_syllabus(uuid, jsonb), public.admin_save_syllabus_points(uuid, jsonb),
  public.admin_delete_syllabus(uuid), public.admin_reorder_syllabuses(uuid[]),
  public.admin_set_post_syllabus(uuid, uuid[]) from public;
grant execute on function public.admin_save_syllabus(uuid, jsonb), public.admin_save_syllabus_points(uuid, jsonb),
  public.admin_delete_syllabus(uuid), public.admin_reorder_syllabuses(uuid[]),
  public.admin_set_post_syllabus(uuid, uuid[]) to authenticated;

-- The activity log names a syllabus by its current title, like the other items.
create or replace view public.admin_activity_events with (security_invoker = true) as
  select e.id, e.action, e.entity, e.entity_id, e.meta, e.at,
         nullif(coalesce(p.title, s.title, m.original_name, j.name, r.title, sj.name, sy.title), '') as name
  from public.audit_events e
  left join public.posts p on e.entity = 'post' and p.id::text = e.entity_id
  left join public.sections s on e.entity = 'section' and s.id::text = e.entity_id
  left join public.media m on e.entity = 'media' and m.id::text = e.entity_id
  left join public.projects j on e.entity = 'project' and j.id::text = e.entity_id
  left join public.series r on e.entity = 'series' and r.id::text = e.entity_id
  left join public.subjects sj on e.entity = 'subject' and sj.id = e.entity_id
  left join public.syllabuses sy on e.entity = 'syllabus' and sy.id::text = e.entity_id;
