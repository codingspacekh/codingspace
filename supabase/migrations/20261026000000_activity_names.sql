-- The activity log with each item's current name (03 ADM-15), in one read. The app used to
-- look the names up in a second round of queries; each one is a trip to the database.
-- Renamed items read as they are now; a deleted one has no name (the event's meta keeps it).

create view public.admin_activity_events with (security_invoker = true) as
  select e.id, e.action, e.entity, e.entity_id, e.meta, e.at,
         nullif(coalesce(p.title, s.title, m.original_name, j.name), '') as name
  from public.audit_events e
  left join public.posts p on e.entity = 'post' and p.id::text = e.entity_id
  left join public.sections s on e.entity = 'section' and s.id::text = e.entity_id
  left join public.media m on e.entity = 'media' and m.id::text = e.entity_id
  left join public.projects j on e.entity = 'project' and j.id::text = e.entity_id;
comment on view public.admin_activity_events is 'audit_events plus the current name of each item (owner only, via RLS).';

revoke all on public.admin_activity_events from anon, authenticated;
grant select on public.admin_activity_events to authenticated;
