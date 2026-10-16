-- M5 site-content admin (03 ADM-11, ADM-13, ADM-14): projects, the author profile and
-- timeline, and the problem of the week. The tables exist since M2 (read side); this adds
-- one audited admin_* function per change. Like the post functions they run as the caller
-- (security invoker), so RLS decides: only the owner with 2FA. Orders are rewritten 1..n.
-- Errors use PostgREST's PTxxx codes: PT404, PT409, PT422.

create or replace function private.audit_site(p_action text, p_entity text, p_id text, p_meta jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.audit_events (action, entity, entity_id, meta) values (p_action, p_entity, p_id, p_meta);
$$;
revoke all on function private.audit_site(text, text, text, jsonb) from public;
grant execute on function private.audit_site(text, text, text, jsonb) to authenticated;

-- ── Projects (ADM-13) ─────────────────────────────────────────────────────
-- Tighter than M2's check: no spaces, no credentials (user:pass@), a real host.
alter table public.projects drop constraint if exists projects_landing_url_check;
alter table public.projects add constraint projects_landing_url_check
  check (landing_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^\s]*)?$'
         and length(landing_url) <= 500);
alter table public.projects add constraint projects_platforms_check check (cardinality(platforms) <= 8);

-- p: { slug (new only), name, glyph, subject_id, tag, description, platforms, landing_url }.
-- A new project goes last. Returns its id.
create or replace function public.admin_save_project(p_id uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  plats text[] := coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'platforms') x
                            where btrim(x) <> ''), '{}');
begin
  if p_id is null then
    insert into public.projects (slug, name, glyph, subject_id, tag, description, platforms, landing_url, sort)
      values (p ->> 'slug', btrim(p ->> 'name'), coalesce(btrim(p ->> 'glyph'), ''), nullif(p ->> 'subject_id', ''),
              coalesce(btrim(p ->> 'tag'), ''), btrim(p ->> 'description'), plats, btrim(p ->> 'landing_url'),
              coalesce((select max(sort) from public.projects), 0) + 1)
      returning id into saved;
    perform private.audit_site('project.create', 'project', saved::text, jsonb_build_object('name', p ->> 'name'));
  else
    update public.projects set
      name = btrim(p ->> 'name'), glyph = coalesce(btrim(p ->> 'glyph'), ''),
      subject_id = nullif(p ->> 'subject_id', ''), tag = coalesce(btrim(p ->> 'tag'), ''),
      description = btrim(p ->> 'description'), platforms = plats, landing_url = btrim(p ->> 'landing_url')
      where id = p_id returning id into saved;
    if saved is null then
      raise exception 'project not found' using errcode = 'PT404';
    end if;
    perform private.audit_site('project.update', 'project', saved::text, jsonb_build_object('name', p ->> 'name'));
  end if;
  return saved;
end;
$$;

-- The one featured project (shown first, and on Home); null features none.
create or replace function public.admin_feature_project(p_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if p_id is not null and not exists (select 1 from public.projects where id = p_id) then
    raise exception 'project not found' using errcode = 'PT404';
  end if;
  -- Two steps: the one-featured index would see two featured rows in a single UPDATE.
  update public.projects set is_featured = false where is_featured and id is distinct from p_id;
  update public.projects set is_featured = true where id = p_id;
  perform private.audit_site('project.feature', 'project', coalesce(p_id::text, ''), '{}');
end;
$$;

create or replace function public.admin_delete_project(p_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  gone public.projects;
begin
  delete from public.projects where id = p_id returning * into gone;
  if gone.id is null then
    raise exception 'project not found' using errcode = 'PT404';
  end if;
  update public.projects t set sort = o.n
    from (select id, row_number() over (order by sort, name) as n from public.projects) o where t.id = o.id;
  perform private.audit_site('project.delete', 'project', p_id::text, jsonb_build_object('name', gone.name));
end;
$$;

-- p_ids: every project, in the new order.
create or replace function public.admin_reorder_projects(p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare
  have uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into have from (select id from public.projects for update) s;
  if cardinality(p_ids) <> cardinality(have)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from have then
    raise exception 'the new order must list every project exactly once' using errcode = 'PT422';
  end if;
  update public.projects t set sort = o.n from unnest(p_ids) with ordinality as o(id, n) where t.id = o.id;
  perform private.audit_site('project.reorder', 'project', '', jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- ── Author profile and timeline (ADM-14) ──────────────────────────────────
alter table public.profile add constraint profile_name_check check (length(name) between 1 and 80);
alter table public.profile add constraint profile_bio_check check (length(bio) <= 2000);

-- p: { name, bio, years, students, email }; empty email / stats mean "not shown".
create or replace function public.admin_save_profile(p jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.profile (id, name, bio, years, students, email)
    values (true, btrim(p ->> 'name'), btrim(coalesce(p ->> 'bio', '')), (p ->> 'years')::smallint,
            (p ->> 'students')::integer, nullif(btrim(coalesce(p ->> 'email', '')), ''))
    on conflict (id) do update set
      name = excluded.name, bio = excluded.bio, years = excluded.years, students = excluded.students,
      email = excluded.email;
  perform private.audit_site('profile.update', 'profile', 'profile', '{}');
end;
$$;

-- p_items: the whole timeline, in order: [{ year, text }]. Replaces what was there.
create or replace function public.admin_save_timeline(p_items jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'the timeline must be a list of at most 50 items' using errcode = 'PT422';
  end if;
  delete from public.timeline_items where true;
  insert into public.timeline_items (year, text, sort)
    select (i ->> 'year')::smallint, btrim(i ->> 'text'), n
    from jsonb_array_elements(p_items) with ordinality as t(i, n);
  perform private.audit_site('timeline.update', 'timeline', 'timeline',
                             jsonb_build_object('items', jsonb_array_length(p_items)));
end;
$$;

-- ── Problem of the week (ADM-11) ──────────────────────────────────────────
alter table public.featured_problems add column updated_at timestamptz not null default now();

create or replace function private.featured_problems_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.section_id is not null and new.subject_id is distinct from
     (select s.subject_id from public.sections s where s.id = new.section_id) then
    raise exception 'the section belongs to another subject' using errcode = 'PT422';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger featured_problems_guard before insert or update on public.featured_problems
  for each row execute function private.featured_problems_guard();

-- p: { subject_id, section_id, week_of, statement, hint, solution }. Returns the id and the
-- subjects whose pages show it (old and new, when the subject changed).
create or replace function public.admin_save_problem(p_id uuid, p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  before public.featured_problems;
  saved public.featured_problems;
begin
  if p_id is null then
    insert into public.featured_problems (subject_id, section_id, week_of, statement, hint, solution)
      values (p ->> 'subject_id', nullif(p ->> 'section_id', '')::uuid, (p ->> 'week_of')::date,
              btrim(p ->> 'statement'), btrim(coalesce(p ->> 'hint', '')), btrim(coalesce(p ->> 'solution', '')))
      returning * into saved;
    perform private.audit_site('problem.create', 'problem', saved.id::text,
                               jsonb_build_object('subject', saved.subject_id, 'week_of', saved.week_of));
  else
    select * into before from public.featured_problems where id = p_id for update;
    if not found then
      raise exception 'problem not found' using errcode = 'PT404';
    end if;
    update public.featured_problems set
      subject_id = p ->> 'subject_id', section_id = nullif(p ->> 'section_id', '')::uuid,
      week_of = (p ->> 'week_of')::date, statement = btrim(p ->> 'statement'),
      hint = btrim(coalesce(p ->> 'hint', '')), solution = btrim(coalesce(p ->> 'solution', '')),
      -- Moving the current problem to another subject would leave two current there.
      is_current = before.is_current and before.subject_id = p ->> 'subject_id'
      where id = p_id returning * into saved;
    perform private.audit_site('problem.update', 'problem', saved.id::text,
                               jsonb_build_object('subject', saved.subject_id, 'week_of', saved.week_of));
  end if;
  return jsonb_build_object('id', saved.id, 'subjects',
    to_jsonb(array_remove(array[saved.subject_id, nullif(before.subject_id, saved.subject_id)], null)));
end;
$$;

-- Makes a problem its subject's current one (the one students see), or stops showing it.
create or replace function public.admin_set_current_problem(p_id uuid, p_current boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.featured_problems;
begin
  select * into r from public.featured_problems where id = p_id for update;
  if not found then
    raise exception 'problem not found' using errcode = 'PT404';
  end if;
  if p_current then
    update public.featured_problems set is_current = false where subject_id = r.subject_id and is_current and id <> p_id;
  end if;
  update public.featured_problems set is_current = p_current where id = p_id;
  perform private.audit_site(case when p_current then 'problem.show' else 'problem.hide' end, 'problem',
                             p_id::text, jsonb_build_object('subject', r.subject_id));
  return jsonb_build_object('subjects', jsonb_build_array(r.subject_id));
end;
$$;

create or replace function public.admin_delete_problem(p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  gone public.featured_problems;
begin
  delete from public.featured_problems where id = p_id returning * into gone;
  if gone.id is null then
    raise exception 'problem not found' using errcode = 'PT404';
  end if;
  perform private.audit_site('problem.delete', 'problem', p_id::text, jsonb_build_object('subject', gone.subject_id));
  return jsonb_build_object('subjects', jsonb_build_array(gone.subject_id), 'was_current', gone.is_current);
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────
revoke all on function
  public.admin_save_project(uuid, jsonb), public.admin_feature_project(uuid), public.admin_delete_project(uuid),
  public.admin_reorder_projects(uuid[]), public.admin_save_profile(jsonb), public.admin_save_timeline(jsonb),
  public.admin_save_problem(uuid, jsonb), public.admin_set_current_problem(uuid, boolean),
  public.admin_delete_problem(uuid)
  from public, anon;
grant execute on function
  public.admin_save_project(uuid, jsonb), public.admin_feature_project(uuid), public.admin_delete_project(uuid),
  public.admin_reorder_projects(uuid[]), public.admin_save_profile(jsonb), public.admin_save_timeline(jsonb),
  public.admin_save_problem(uuid, jsonb), public.admin_set_current_problem(uuid, boolean),
  public.admin_delete_problem(uuid)
  to authenticated;
