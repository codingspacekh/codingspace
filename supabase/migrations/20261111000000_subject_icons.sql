-- A subject can show an icon instead of its symbol (owner request 2026-10-23): one of the icons
-- built into the site (src/lib/subject-icons.ts), by name. '' = the symbol, as until now; the
-- symbol is still kept, for wherever an icon can't go. The site checks the name against its
-- list; the database only checks its shape, so adding an icon needs no migration.

alter table public.subjects
  add column icon text not null default '' check (icon ~ '^[a-z]{0,24}$');

-- ── Saving a subject: as in 20261101000000, plus the icon ──────────────────
-- p: { id (new only: the address, /study/<id>), name, glyph, icon, color, blurb, intro, visible }.
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
    insert into public.subjects (id, name, glyph, icon, color, blurb, intro, visible, sort)
      values (p ->> 'id', btrim(p ->> 'name'), coalesce(btrim(p ->> 'glyph'), ''), coalesce(p ->> 'icon', ''),
              coalesce(p ->> 'color', 'cyan'),
              btrim(coalesce(p ->> 'blurb', '')), btrim(coalesce(p ->> 'intro', '')),
              coalesce((p ->> 'visible')::boolean, false),
              coalesce((select max(sort) from public.subjects), -1) + 1)
      returning id into saved;
    perform private.audit_site('subject.create', 'subject', saved, jsonb_build_object('name', p ->> 'name'));
  else
    update public.subjects set
      name = btrim(p ->> 'name'), glyph = coalesce(btrim(p ->> 'glyph'), ''), icon = coalesce(p ->> 'icon', ''),
      color = coalesce(p ->> 'color', color),
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
