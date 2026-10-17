-- Owner request (2026-10-17): deleting a section deletes its lessons too, instead of refusing
-- while it has any. "Its lessons" are the ones filed under it (their draft section), as the
-- Study structure page lists them; each one is audited like a single post delete, with their
-- revisions going with them (on delete cascade).
--
-- One case is still refused: a lesson that is live in this section but whose draft has been
-- moved to another one (not yet re-published). It is listed under the other section, so
-- deleting it here would surprise; re-publish (or move it back) first. A lesson filed elsewhere
-- that is not live only remembers this as its old live section: that memory is cleared.
create or replace function public.admin_delete_section(p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  s public.sections;
  n integer;
  r public.posts;
  gone jsonb := '[]';
begin
  s := private.lock_section(p_id);
  select count(*) into n from public.posts
    where live_section_id = p_id and section_id is distinct from p_id and status = 'published';
  if n > 0 then
    raise exception '% lesson(s) live in this section were moved to another one: publish the move first', n
      using errcode = 'PT409';
  end if;
  update public.posts set live_section_id = null
    where live_section_id = p_id and section_id is distinct from p_id;
  for r in select * from public.posts where section_id = p_id order by sort, id for update loop
    delete from public.posts where id = r.id;
    perform private.audit_post('post.delete', r.id,
      jsonb_build_object('slug', r.slug, 'title', r.title, 'was_published', r.status = 'published',
                         'with_section', s.slug));
    gone := gone || jsonb_build_object('slug', r.slug, 'kind', r.kind, 'subject', r.live_subject_id,
                                       'section', r.live_section_id, 'was_published', r.status = 'published');
  end loop;
  delete from public.sections where id = p_id;
  -- Close the gap.
  update public.sections t set sort = o.n
    from (select id, row_number() over (order by sort, slug) as n from public.sections where subject_id = s.subject_id) o
    where t.id = o.id;
  perform private.audit_section('section.delete', p_id,
    jsonb_build_object('slug', s.slug, 'title', s.title, 'lessons', jsonb_array_length(gone)));
  return jsonb_build_object('subject', s.subject_id, 'slug', s.slug, 'lessons', gone);
end;
$$;
