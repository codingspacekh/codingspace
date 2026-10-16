-- Study structure (03 ADM-12), brought forward from M5 at the owner's request: rename and
-- describe sections, reorder them, delete empty ones, reorder the lessons inside one.
-- A section's slug never changes: /study/<subject>#<slug> links keep working.
-- Orders are rewritten as 1..n, so they stay contiguous (the M5 test in 04-milestones).

create or replace function private.lock_section(p_id uuid)
returns public.sections language plpgsql set search_path = '' as $$
declare
  s public.sections;
begin
  select * into s from public.sections where id = p_id for update;
  if not found then
    raise exception 'section not found' using errcode = 'PT404';
  end if;
  return s;
end;
$$;
revoke all on function private.lock_section(uuid) from public;
grant execute on function private.lock_section(uuid) to authenticated;

create or replace function private.audit_section(p_action text, p_section uuid, p_meta jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.audit_events (action, entity, entity_id, meta) values (p_action, 'section', p_section::text, p_meta);
$$;
revoke all on function private.audit_section(text, uuid, jsonb) from public;
grant execute on function private.audit_section(text, uuid, jsonb) to authenticated;

create or replace function public.admin_update_section(p_id uuid, p_title text, p_description text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  s public.sections;
begin
  s := private.lock_section(p_id);
  update public.sections set title = btrim(p_title), description = btrim(coalesce(p_description, ''))
    where id = p_id returning * into s;
  perform private.audit_section('section.update', p_id, jsonb_build_object('title', s.title));
  return jsonb_build_object('subject', s.subject_id, 'slug', s.slug);
end;
$$;

-- p_ids: every section of the subject, in the new order.
create or replace function public.admin_reorder_sections(p_subject_id text, p_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare
  have uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into have
    from (select id from public.sections where subject_id = p_subject_id for update) s;
  if cardinality(p_ids) <> cardinality(have)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from have then
    raise exception 'the new order must list every section of the subject exactly once' using errcode = 'PT422';
  end if;
  update public.sections s set sort = o.n
    from unnest(p_ids) with ordinality as o(id, n) where s.id = o.id;
  insert into public.audit_events (action, entity, entity_id, meta)
    values ('section.reorder', 'subject', p_subject_id, jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- p_ids: every lesson in the section (by its draft section), in the new order.
create or replace function public.admin_reorder_lessons(p_section_id uuid, p_ids uuid[])
returns jsonb language plpgsql set search_path = '' as $$
declare
  s public.sections;
  have uuid[];
begin
  s := private.lock_section(p_section_id);
  select coalesce(array_agg(id order by id), '{}') into have
    from (select id from public.posts where section_id = p_section_id for update) p;
  if cardinality(p_ids) <> cardinality(have)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from have then
    raise exception 'the new order must list every lesson of the section exactly once' using errcode = 'PT422';
  end if;
  update public.posts p set sort = o.n
    from unnest(p_ids) with ordinality as o(id, n) where p.id = o.id;
  perform private.audit_section('section.reorder_lessons', p_section_id, jsonb_build_object('order', to_jsonb(p_ids)));
  return jsonb_build_object('subject', s.subject_id, 'slug', s.slug);
end;
$$;

-- Only an empty section: no lesson has it as its draft or its live section.
create or replace function public.admin_delete_section(p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  s public.sections;
  n integer;
begin
  s := private.lock_section(p_id);
  select count(*) into n from public.posts where section_id = p_id or live_section_id = p_id;
  if n > 0 then
    raise exception 'the section still has % lesson(s): move or delete them first', n using errcode = 'PT409';
  end if;
  delete from public.sections where id = p_id;
  -- Close the gap.
  update public.sections t set sort = o.n
    from (select id, row_number() over (order by sort, slug) as n from public.sections where subject_id = s.subject_id) o
    where t.id = o.id;
  perform private.audit_section('section.delete', p_id, jsonb_build_object('slug', s.slug, 'title', s.title));
  return jsonb_build_object('subject', s.subject_id, 'slug', s.slug);
end;
$$;

revoke all on function public.admin_update_section(uuid, text, text), public.admin_reorder_sections(text, uuid[]),
  public.admin_reorder_lessons(uuid, uuid[]), public.admin_delete_section(uuid) from public, anon;
grant execute on function public.admin_update_section(uuid, text, text), public.admin_reorder_sections(text, uuid[]),
  public.admin_reorder_lessons(uuid, uuid[]), public.admin_delete_section(uuid) to authenticated;
