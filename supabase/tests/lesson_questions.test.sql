-- Questions on lessons (v1.1): asked by visitors through ask_question only, shown once approved.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'ineq', 'Inequalities', 1);
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, published_at, live_revision,
                          live_subject_id, live_section_id, live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'am-gm', 'math', '10000000-0000-0000-0000-000000000001',
          'published', 'AM-GM', 'AM-GM', now(), 1, 'math', '10000000-0000-0000-0000-000000000001', 1, 5, 0, 'en');
insert into public.posts (id, kind, slug, subject_id, section_id, status, title)
  values ('20000000-0000-0000-0000-000000000002', 'lesson', 'draft', 'math', '10000000-0000-0000-0000-000000000001',
          'draft', 'Draft');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$insert into public.questions (post_id, name, body) values ('20000000-0000-0000-0000-000000000001', 'x', 'y')$$,
                 '42501', null, 'visitors cannot insert directly');
select is(public.ask_question('am-gm', ' Dara ', ' Why does it hold? ', repeat('a', 64)), 'ok', 'a visitor asks');
select is(public.ask_question('draft', 'Dara', 'Q', repeat('a', 64)), 'not_found', 'not on a draft');
select is(public.ask_question('nope', 'Dara', 'Q', repeat('a', 64)), 'not_found', 'not on a missing lesson');
select throws_ok($$select public.ask_question('am-gm', '', 'Q', repeat('a', 64))$$, 'PT422', null, 'a name is needed');
select throws_ok($$select public.ask_question('am-gm', 'D', 'see https://a.x https://b.x www.c.x', repeat('a', 64))$$,
                 'PT422', 'at most 2 links in a question', 'at most 2 links');
select throws_ok($$select public.ask_question('am-gm', 'D', 'Q', 'not-a-key')$$, 'PT422', 'bad key', 'the key is a hash');
select is((select count(*)::int from public.questions), 0, 'a pending question is not visible');

select is((select count(*)::int from (select public.ask_question('am-gm', 'D', 'Q' || n, repeat('b', 64)) as r
                                       from generate_series(1, 5) n) x where r = 'ok'), 5, 'five in an hour are fine');
select is(public.ask_question('am-gm', 'D', 'one too many', repeat('b', 64)), 'limited', 'six in an hour is too many');
select is(public.ask_question('am-gm', 'E', 'another visitor', repeat('c', 64)), 'ok', 'other visitors still can');

reset role;
select results_eq($$select name, body, status from public.questions where body like 'Why%'$$,
                  $$values ('Dara'::text, 'Why does it hold?'::text, 'pending'::text)$$, 'stored trimmed, pending');
select is((select count(*)::int from private.question_hits where key = repeat('b', 64)), 1, 'hits are counted per hour');

-- A non-owner can't moderate; the owner approves and answers.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
select throws_ok(format($$select public.admin_save_question(%L, '{"status":"published"}')$$,
                        (select id from public.questions where name = 'Dara')), 'PT404', null, 'a non-owner cannot moderate');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select is(public.admin_save_question((select id from public.questions where name = 'Dara'),
  '{"status":"published","answer":" Because of squares. "}'), 'am-gm', 'the owner publishes with an answer');
select results_eq($$select status, answer, published_at is not null, answered_at is not null from public.questions where name = 'Dara'$$,
                  $$values ('published'::text, 'Because of squares.'::text, true, true)$$, 'published and answered');
select is((select action from public.audit_events order by id desc limit 1), 'question.publish', 'moderation is audited');
select throws_ok(format($$select public.admin_save_question(%L, '{"status":"spam"}')$$,
                        (select id from public.questions where name = 'Dara')), 'PT422', null, 'only known statuses');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select name, answer from public.questions$$, $$values ('Dara'::text, 'Because of squares.'::text)$$,
                  'visitors see only the approved question');

-- Unpublishing the lesson hides its questions.
reset role;
update public.posts set status = 'draft' where slug = 'am-gm';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.questions), 0, 'questions of an unpublished lesson are hidden');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select is(public.admin_delete_question((select id from public.questions where name = 'Dara')), 'am-gm', 'deleted');

select * from finish();
rollback;
