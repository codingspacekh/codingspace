-- Comments on life posts (v1.1): the same rules and functions as questions on lessons.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.posts (id, kind, slug, status, title, live_title, published_at, live_revision,
                          live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000011', 'life', 'my-week', 'published', 'My week', 'My week', now(), 1,
          1, 3, 0, 'en');
insert into public.posts (id, kind, slug, status, title)
  values ('20000000-0000-0000-0000-000000000012', 'life', 'life-draft', 'draft', 'Draft');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.ask_question('my-week', 'Dara', ' Nice post! ', repeat('d', 64)), 'ok', 'a visitor comments on a life post');
select is(public.ask_question('life-draft', 'Dara', 'Hi', repeat('d', 64)), 'not_found', 'not on a draft life post');
select is((select count(*)::int from public.questions), 0, 'a pending comment is not visible');
select is((select count(*)::int from (select public.ask_question('my-week', 'D', 'C' || n, repeat('d', 64)) as r
                                       from generate_series(1, 5) n) x where r = 'limited'), 1,
          'comments count towards the same 5 an hour');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select is(public.admin_save_question((select id from public.questions where body = 'Nice post!'),
  '{"status":"published","answer":"Thank you!"}'), 'my-week', 'the owner publishes it with a reply');
select is((select meta ->> 'kind' from public.audit_events order by id desc limit 1), 'life',
          'the audit entry says it was on a life post');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select name, body, answer from public.questions$$,
                  $$values ('Dara'::text, 'Nice post!'::text, 'Thank you!'::text)$$, 'visitors see the approved comment');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select is(public.admin_delete_question((select id from public.questions where body = 'Nice post!')), 'my-week', 'deleted');
select is((select meta ->> 'kind' from public.audit_events order by id desc limit 1), 'life', 'the delete is audited too');

select * from finish();
rollback;
