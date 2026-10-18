-- v1.1 subjects from the admin: the owner adds, edits, reorders, hides and deletes subjects
-- (until now the four were fixed: seeded in the init migration, their copy in the code).
-- The table becomes the only source: menus, Home, the orbit, study pages and the sitemap read it.
-- A hidden subject (visible = false) never leaves the database for visitors: not the subject,
-- not its sections, lessons or problem of the week. A new subject starts hidden, so the owner
-- can build its sections and lessons before students see it.

alter table public.subjects
  add column blurb text not null default '' check (length(blurb) <= 200),
  add column visible boolean not null default true;
alter table public.subjects alter column sort type integer;
alter table public.subjects
  add constraint subjects_id_length check (length(id) <= 24),
  add constraint subjects_name_check check (length(btrim(name)) between 1 and 40),
  add constraint subjects_glyph_check check (char_length(glyph) <= 4),
  add constraint subjects_intro_check check (length(intro) <= 600),
  add constraint subjects_color_check
    check (color in ('cyan', 'violet', 'amber', 'lime', 'pink', 'orange', 'sky', 'rose', 'gold'));

-- The copy that lived in src/lib/subjects.ts until now.
update public.subjects set
  blurb = 'Competition maths: inequalities, sequences, functional equations and more.',
  intro = 'Olympiad-style mathematics. These problems reward clever ideas, not formula plugging. Each section moves from first tools to contest-level problems.'
  where id = 'math';
update public.subjects set
  blurb = 'Mechanics to modern physics, with diagrams and simulations.',
  intro = 'Physics built from intuition first, then equations. Each lesson has worked problems and, where possible, a simulation to play with.'
  where id = 'physics';
update public.subjects set
  blurb = 'Python, algorithms, data structures and Cambridge CS 9618.',
  intro = 'Programming from the first loop to Paper 4. Every lesson has code you can run, plus pseudocode in the Cambridge 9618 style.'
  where id = 'coding';
update public.subjects set
  blurb = 'Cambridge IT 9626: spreadsheets, databases, networks and more.',
  intro = 'Cambridge AS & A Level Information Technology (9626), with theory notes and step-by-step practical walkthroughs.'
  where id = 'it';

-- ── Who sees what ─────────────────────────────────────────────────────────
-- Visitors: visible subjects only, and nothing inside a hidden one. The owner: everything.
drop policy subjects_read on public.subjects;
create policy subjects_read on public.subjects for select to anon, authenticated using (visible);
grant insert, update, delete on public.subjects to authenticated;
create policy subjects_owner on public.subjects for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

drop policy sections_read on public.sections;
create policy sections_read on public.sections for select to anon, authenticated
  using (exists (select 1 from public.subjects s where s.id = subject_id and s.visible));

-- Covers public_posts, search_posts and the series views, which all read posts as anon.
drop policy posts_read_published on public.posts;
create policy posts_read_published on public.posts for select to anon
  using (status = 'published'
         and (live_subject_id is null
              or exists (select 1 from public.subjects s where s.id = live_subject_id and s.visible)));

drop policy featured_read_current on public.featured_problems;
create policy featured_read_current on public.featured_problems for select to anon
  using (is_current and exists (select 1 from public.subjects s where s.id = subject_id and s.visible));

-- ── Admin ─────────────────────────────────────────────────────────────────
-- p: { id (new only: the address, /study/<id>), name, glyph, color, blurb, intro, visible }.
-- A new subject goes last. Returns its id.
create or replace function public.admin_save_subject(p_id text, p jsonb)
returns text language plpgsql set search_path = '' as $$
declare
  saved text;
begin
  if p_id is null then
    if coalesce(p ->> 'id', '') !~ '^[a-z]+$' then
      raise exception 'the address must be lowercase letters only (a-z)' using errcode = 'PT422';
    end if;
    insert into public.subjects (id, name, glyph, color, blurb, intro, visible, sort)
      values (p ->> 'id', btrim(p ->> 'name'), coalesce(btrim(p ->> 'glyph'), ''), coalesce(p ->> 'color', 'cyan'),
              btrim(coalesce(p ->> 'blurb', '')), btrim(coalesce(p ->> 'intro', '')),
              coalesce((p ->> 'visible')::boolean, false),
              coalesce((select max(sort) from public.subjects), -1) + 1)
      returning id into saved;
    perform private.audit_site('subject.create', 'subject', saved, jsonb_build_object('name', p ->> 'name'));
  else
    update public.subjects set
      name = btrim(p ->> 'name'), glyph = coalesce(btrim(p ->> 'glyph'), ''), color = coalesce(p ->> 'color', color),
      blurb = btrim(coalesce(p ->> 'blurb', '')), intro = btrim(coalesce(p ->> 'intro', '')),
      visible = coalesce((p ->> 'visible')::boolean, visible)
      where id = p_id returning id into saved;
    if saved is null then
      raise exception 'subject not found' using errcode = 'PT404';
    end if;
    perform private.audit_site('subject.update', 'subject', saved,
      jsonb_build_object('name', p ->> 'name', 'visible', (p ->> 'visible')::boolean));
  end if;
  return saved;
end;
$$;

-- Only an empty subject can go: its sections, lessons and problems would have nowhere to live.
-- Projects only use the subject as a label, so they lose it.
create or replace function public.admin_delete_subject(p_id text)
returns void language plpgsql set search_path = '' as $$
declare
  gone public.subjects;
begin
  select * into gone from public.subjects where id = p_id for update;
  if gone.id is null then
    raise exception 'subject not found' using errcode = 'PT404';
  end if;
  if exists (select 1 from public.sections where subject_id = p_id)
     or exists (select 1 from public.posts where subject_id = p_id or live_subject_id = p_id)
     or exists (select 1 from public.featured_problems where subject_id = p_id) then
    raise exception 'delete or move its sections, lessons and problems first' using errcode = 'PT409';
  end if;
  if (select count(*) from public.subjects) = 1 then
    raise exception 'the site needs at least one subject' using errcode = 'PT409';
  end if;
  update public.projects set subject_id = null where subject_id = p_id;
  delete from public.subjects where id = p_id;
  update public.subjects t set sort = o.n - 1
    from (select id, row_number() over (order by sort, id) as n from public.subjects) o where t.id = o.id;
  perform private.audit_site('subject.delete', 'subject', p_id, jsonb_build_object('name', gone.name));
end;
$$;

-- p_ids: every subject, in the new order.
create or replace function public.admin_reorder_subjects(p_ids text[])
returns void language plpgsql set search_path = '' as $$
declare
  have text[];
begin
  select coalesce(array_agg(id order by id), '{}') into have from (select id from public.subjects for update) s;
  if cardinality(p_ids) <> cardinality(have)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from have then
    raise exception 'the new order must list every subject exactly once' using errcode = 'PT422';
  end if;
  update public.subjects t set sort = o.n - 1 from unnest(p_ids) with ordinality as o(id, n) where t.id = o.id;
  perform private.audit_site('subject.reorder', 'subject', '', jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

revoke all on function public.admin_save_subject(text, jsonb), public.admin_delete_subject(text),
  public.admin_reorder_subjects(text[]) from public;
grant execute on function public.admin_save_subject(text, jsonb), public.admin_delete_subject(text),
  public.admin_reorder_subjects(text[]) to authenticated;

-- The activity log names a subject by its current name, like the other items.
create or replace view public.admin_activity_events with (security_invoker = true) as
  select e.id, e.action, e.entity, e.entity_id, e.meta, e.at,
         nullif(coalesce(p.title, s.title, m.original_name, j.name, r.title, sj.name), '') as name
  from public.audit_events e
  left join public.posts p on e.entity = 'post' and p.id::text = e.entity_id
  left join public.sections s on e.entity = 'section' and s.id::text = e.entity_id
  left join public.media m on e.entity = 'media' and m.id::text = e.entity_id
  left join public.projects j on e.entity = 'project' and j.id::text = e.entity_id
  left join public.series r on e.entity = 'series' and r.id::text = e.entity_id
  left join public.subjects sj on e.entity = 'subject' and sj.id = e.entity_id;
