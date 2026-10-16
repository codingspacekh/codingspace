-- A new lesson goes to the end of its section, and publish/unpublish/delete report the sections
-- whose lesson pages must be rebuilt (their prev/next links and section list change).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1),
         ('10000000-0000-0000-0000-000000000002', 'math', 'sequences', 'Sequences', 2);
insert into public.posts (kind, slug, subject_id, section_id, sort, title)
  values ('lesson', 'one', 'math', '10000000-0000-0000-0000-000000000001', 1, 'One'),
         ('lesson', 'two', 'math', '10000000-0000-0000-0000-000000000001', 2, 'Two');
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create temp table out (name text primary key, v jsonb);
grant all on out to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

insert into ids values ('new', public.admin_create_post('lesson', 'Three', 'three', 'math', '10000000-0000-0000-0000-000000000001', 'en'));
select is((select sort from public.posts where slug = 'three'), 3, 'a new lesson goes after the last one in its section');

insert into ids values ('loose', public.admin_create_post('lesson', 'Loose', 'loose', 'math', null, 'en'));
select public.admin_save_post((select id from ids where name = 'loose'), 1,
  '{"section_id":"10000000-0000-0000-0000-000000000002"}');
select is((select sort from public.posts where slug = 'loose'), 1, 'moving into an empty section: first place');
select public.admin_save_post((select id from ids where name = 'loose'), 2,
  '{"section_id":"10000000-0000-0000-0000-000000000001"}');
select is((select sort from public.posts where slug = 'loose'), 4, 'moving into a section: last place');
select public.admin_save_post((select id from ids where name = 'loose'), 3, '{"title":"Loose, renamed"}');
select is((select sort from public.posts where slug = 'loose'), 4, 'other edits keep its place');

-- Publish reports the section, and the previous one when a live lesson moved.
select public.admin_save_post((select id from ids where name = 'new'), 1, '{"summary":"s"}');
insert into out values ('pub', public.admin_publish_post((select id from ids where name = 'new'), 2,
  '{"html":"<p>x</p>","toc":[],"search_text":"x","has_math":false,"has_code":false}'));
select is((select v ->> 'section' from out where name = 'pub'), '10000000-0000-0000-0000-000000000001', 'publish reports its section');
select is((select v ->> 'previous_section' from out where name = 'pub'), null, 'not live before: no previous section');

select public.admin_save_post((select id from ids where name = 'new'), 2, '{"section_id":"10000000-0000-0000-0000-000000000002"}');
insert into out values ('move', public.admin_publish_post((select id from ids where name = 'new'), 3,
  '{"html":"<p>x</p>","toc":[],"search_text":"x","has_math":false,"has_code":false}'));
select is((select v ->> 'previous_section' from out where name = 'move'), '10000000-0000-0000-0000-000000000001',
          'an update that moved the lesson reports the section it left');

insert into out values ('unpub', public.admin_unpublish_post((select id from ids where name = 'new')));
select is((select v ->> 'section' from out where name = 'unpub'), '10000000-0000-0000-0000-000000000002', 'unpublish reports its section');

select public.admin_publish_post((select id from ids where name = 'new'), 3,
  '{"html":"<p>x</p>","toc":[],"search_text":"x","has_math":false,"has_code":false}');
insert into out values ('del', public.admin_delete_post((select id from ids where name = 'new')));
select is((select v ->> 'section' from out where name = 'del'), '10000000-0000-0000-0000-000000000002', 'delete reports its section');

select * from finish();
rollback;
