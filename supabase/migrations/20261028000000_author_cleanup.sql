-- Second step of the Author page in sections (20261027000000_author_sections.sql), now that the
-- app uses only the new tables and author_page(): remove the old timeline, the old public views
-- and save functions, and visitors' direct read of the profile table. From here on, visitors can
-- read the Author page only through author_page(), so parts the owner hides never reach them.

drop function public.admin_save_profile(jsonb);
drop function public.admin_save_timeline(jsonb);
drop view public.public_profile;
drop view public.public_timeline;
drop table public.timeline_items;

drop policy profile_read on public.profile;
revoke select on public.profile from anon;
