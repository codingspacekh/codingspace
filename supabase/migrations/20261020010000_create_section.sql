-- Adding a section from the editor's Section menu (03 ADM-12, brought forward from M5 for the
-- private beta). Renaming, reordering and deleting sections stay in M5.
create or replace function public.admin_create_section(p_subject_id text, p_title text, p_slug text, p_description text)
returns uuid language plpgsql set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.sections (subject_id, slug, title, description, sort)
    values (p_subject_id, p_slug, btrim(p_title), coalesce(p_description, ''),
            (select coalesce(max(s.sort), 0) + 1 from public.sections s where s.subject_id = p_subject_id))
    returning id into new_id;
  insert into public.audit_events (action, entity, entity_id, meta)
    values ('section.create', 'section', new_id::text, jsonb_build_object('subject', p_subject_id, 'slug', p_slug));
  return new_id;
end;
$$;
revoke all on function public.admin_create_section(text, text, text, text) from public, anon;
grant execute on function public.admin_create_section(text, text, text, text) to authenticated;
