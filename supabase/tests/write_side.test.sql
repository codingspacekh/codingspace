-- M3 write side (03 ADM-03, ADM-05…09, §8.2): drafts, live snapshots, revisions, audit.
-- Every change goes through one admin_* function = one transaction, with its audit row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

-- ── Structure and access ──────────────────────────────────────────────────
select has_table('public', 'post_revisions', 'post_revisions table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.post_revisions'::regclass), 'RLS is on for post_revisions');
select has_view('public', 'admin_posts', 'admin_posts view exists');
select ok((select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.admin_posts'::regclass),
          'admin_posts runs with the caller''s rights');
select ok(not has_table_privilege('anon', 'public.admin_posts', 'select'), 'anon cannot read admin_posts');
select ok(not has_table_privilege('anon', 'public.post_revisions', 'select'), 'anon cannot read revisions');

select ok(not has_function_privilege('anon', f, 'execute'), format('anon cannot call %s', f))
  from unnest(array[
    'public.admin_create_post(text,text,text,text,uuid,text)',
    'public.admin_save_post(uuid,integer,jsonb)',
    'public.admin_publish_post(uuid,integer,jsonb)',
    'public.admin_unpublish_post(uuid)',
    'public.admin_schedule_post(uuid,integer,timestamptz)',
    'public.admin_unschedule_post(uuid)',
    'public.admin_restore_revision(uuid,integer,bigint)',
    'public.admin_delete_post(uuid)']) as f;

select ok(not has_column_privilege('anon', 'public.posts', c, 'select'), format('anon cannot read draft %s', c))
  from unnest(array['subject_id', 'section_id', 'level', 'minutes', 'problem_count', 'lang']) as c;

-- Fixtures (as the migration owner)
insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1),
         ('10000000-0000-0000-0000-000000000002', 'math', 'sequences', 'Sequences', 2),
         ('10000000-0000-0000-0000-000000000003', 'physics', 'mechanics', 'Mechanics', 1);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create temp table out (name text primary key, v jsonb);
grant all on out to authenticated;

-- ── The owner, with 2FA ───────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

insert into ids values ('lesson', public.admin_create_post('lesson', 'AM–GM', 'am-gm', 'math',
                                                           '10000000-0000-0000-0000-000000000001', 'en'));
insert into ids values ('life', public.admin_create_post('life', 'Hello', 'hello', null, null, 'en'));
select is((select status from public.posts where id = (select id from ids where name = 'lesson')), 'draft',
          'a new post is a draft');
select is((select revision from public.posts where id = (select id from ids where name = 'lesson')), 1,
          'a new post starts at revision 1');
select is((select action from public.audit_events order by id desc limit 1), 'post.create', 'creating writes an audit row');

select throws_ok($$select public.admin_create_post('lesson', 'X', 'x', 'math', '10000000-0000-0000-0000-000000000003', 'en')$$,
                 'PT422', null, 'a section must belong to the post''s subject');
select throws_ok($$select public.admin_create_post('lesson', 'X', 'am-gm', 'math', null, 'en')$$,
                 '23505', null, 'slugs are unique');

-- ── Saving drafts ─────────────────────────────────────────────────────────
select is(public.admin_save_post((select id from ids where name = 'lesson'), 1,
            '{"summary":"Means","content_json":{"type":"doc","content":[]},"level":2,"minutes":12}'),
          2, 'saving returns the next revision');
select throws_ok($$select public.admin_save_post((select id from ids where name = 'lesson'), 1, '{"title":"stale tab"}')$$,
                 'PT409', null, 'a save based on an old revision is refused (another tab saved first)');
select throws_ok($$select public.admin_save_post((select id from ids where name = 'lesson'), 2, '{"status":"published"}')$$,
                 'PT422', null, 'only editable fields can be saved (not status, live fields…)');
select throws_ok($$select public.admin_save_post((select id from ids where name = 'lesson'), 2, '{"level":7}')$$,
                 '23514', null, 'field constraints still apply');
select throws_ok($$select public.admin_save_post('00000000-0000-0000-0000-00000000dead', 1, '{}')$$,
                 'PT404', null, 'saving a missing post is 404');
select is((select count(*)::int from public.post_revisions where post_id = (select id from ids where name = 'lesson')), 1,
          'the first save keeps a revision');
select is(public.admin_save_post((select id from ids where name = 'lesson'), 2, '{"title":"The AM–GM inequality"}'), 3,
          'a second save right after');
select is((select count(*)::int from public.post_revisions where post_id = (select id from ids where name = 'lesson')), 1,
          'autosaves within 10 minutes do not pile up revisions');

-- ── Publishing ────────────────────────────────────────────────────────────
select throws_ok($$select public.admin_publish_post((select id from ids where name = 'lesson'), 3,
                   '{"html":"","toc":[],"search_text":"","has_math":false,"has_code":false}')$$,
                 'PT422', null, 'publishing needs rendered HTML');
select throws_ok($$select public.admin_publish_post((select id from ids where name = 'lesson'), 2,
                   '{"html":"<p>x</p>","toc":[],"search_text":"x","has_math":false,"has_code":false}')$$,
                 'PT409', null, 'publishing an old revision is refused');

insert into out values ('publish', public.admin_publish_post((select id from ids where name = 'lesson'), 3,
  '{"html":"<p>a+b ≥ 2√ab</p>","toc":[{"id":"proof","text":"Proof","level":2}],"search_text":"mean","has_math":true,"has_code":false}'));
select is((select v ->> 'slug' from out where name = 'publish'), 'am-gm', 'publish returns the slug (for revalidation)');
select is((select v ->> 'subject' from out where name = 'publish'), 'math', 'and the subject');
select is((select v ->> 'was_published' from out where name = 'publish'), 'false', 'and that it was not live before');

select results_eq($$select status, live_title, live_summary, live_level, live_minutes, live_revision
                    from public.posts where id = (select id from ids where name = 'lesson')$$,
                  $$values ('published'::text, 'The AM–GM inequality'::text, 'Means'::text, 2::smallint, 12::smallint, 3)$$,
                  'publish copies the draft into the live snapshot');
select is((select count(*)::int from public.post_revisions
           where post_id = (select id from ids where name = 'lesson') and reason = 'publish'), 1,
          'publish keeps a revision');
select is((select action from public.audit_events order by id desc limit 1), 'post.publish', 'publish writes an audit row');
select is((select has_unpublished_changes from public.admin_posts where slug = 'am-gm'), false,
          'just published: no unpublished changes');

-- Editing a published post changes only the draft. (Publishing does not bump the revision.)
select is(public.admin_save_post((select id from ids where name = 'lesson'), 3,
            '{"title":"AM–GM, rewritten","level":3,"section_id":"10000000-0000-0000-0000-000000000002"}'), 4,
          'save an edit to a published post');
select is((select has_unpublished_changes from public.admin_posts where slug = 'am-gm'), true,
          'now it has unpublished changes');
select results_eq($$select live_title, live_level, live_section_id from public.posts where slug = 'am-gm'$$,
                  $$values ('The AM–GM inequality'::text, 2::smallint, '10000000-0000-0000-0000-000000000001'::uuid)$$,
                  'students still see the live version: title, level and section');
select throws_ok($$select public.admin_save_post((select id from ids where name = 'lesson'), 4, '{"slug":"new-slug"}')$$,
                 'PT422', null, 'the URL is locked once a post has been published');

insert into out values ('update', public.admin_publish_post((select id from ids where name = 'lesson'), 4,
  '{"html":"<p>v2</p>","toc":[],"search_text":"v2","has_math":false,"has_code":false}'));
select is((select v ->> 'was_published' from out where name = 'update'), 'true', 'Update reports it was already live');
select is((select action from public.audit_events order by id desc limit 1), 'post.update', 'Update is audited as an update');
select is((select live_title from public.posts where slug = 'am-gm'), 'AM–GM, rewritten', 'Update replaces the live snapshot');
select ok((select published_at < live_updated_at or published_at = live_updated_at from public.posts where slug = 'am-gm'),
          'the first publish date is kept');

-- ── Unpublish ─────────────────────────────────────────────────────────────
insert into out values ('unpublish', public.admin_unpublish_post((select id from ids where name = 'lesson')));
select is((select status from public.posts where slug = 'am-gm'), 'draft', 'unpublish makes it a draft');
select is((select v ->> 'slug' from out where name = 'unpublish'), 'am-gm', 'unpublish returns the slug');
select is((select action from public.audit_events order by id desc limit 1), 'post.unpublish', 'unpublish is audited');
select throws_ok($$select public.admin_unpublish_post((select id from ids where name = 'lesson'))$$,
                 'PT409', null, 'unpublishing a draft is refused');

-- ── Schedule ──────────────────────────────────────────────────────────────
select throws_ok($$select public.admin_schedule_post((select id from ids where name = 'lesson'), 4, now() - interval '1 minute')$$,
                 'PT422', null, 'cannot schedule in the past');
select lives_ok($$select public.admin_schedule_post((select id from ids where name = 'lesson'), 4, now() + interval '1 day')$$,
                'schedule a draft for tomorrow');
select is((select status from public.posts where slug = 'am-gm'), 'scheduled', 'it is scheduled');
select is((select count(*)::int from public.public_posts where slug = 'am-gm'), 0, 'a scheduled post is not public yet');
select is((select action from public.audit_events order by id desc limit 1), 'post.schedule', 'scheduling is audited');
select lives_ok($$select public.admin_unschedule_post((select id from ids where name = 'lesson'))$$, 'cancel the schedule');
select results_eq($$select status, scheduled_at from public.posts where slug = 'am-gm'$$,
                  $$values ('draft'::text, null::timestamptz)$$, 'back to a draft with no date');

-- Publishing rules apply to schedules too: a lesson needs a section.
insert into ids values ('loose', public.admin_create_post('lesson', 'No section yet', 'loose', 'math', null, 'en'));
select throws_ok($$select public.admin_schedule_post((select id from ids where name = 'loose'), 1, now() + interval '1 day')$$,
                 'PT422', null, 'a lesson without a section cannot be scheduled');
select throws_ok($$select public.admin_publish_post((select id from ids where name = 'loose'), 1,
                   '{"html":"<p>x</p>","toc":[],"search_text":"x","has_math":false,"has_code":false}')$$,
                 'PT422', null, 'or published');

-- ── Revisions: restore ────────────────────────────────────────────────────
insert into out values ('first_rev', to_jsonb((select id from public.post_revisions
  where post_id = (select id from ids where name = 'lesson') order by id limit 1)));
select is(public.admin_restore_revision((select id from ids where name = 'lesson'), 4,
            (select (v #>> '{}')::bigint from out where name = 'first_rev')), 5,
          'restoring a revision is a new revision of the draft');
select is((select title from public.posts where slug = 'am-gm'), 'AM–GM', 'the draft has the old title back');
select is((select action from public.audit_events order by id desc limit 1), 'post.restore', 'restore is audited');

-- ── Delete ────────────────────────────────────────────────────────────────
insert into out values ('delete', public.admin_delete_post((select id from ids where name = 'life')));
select is((select v ->> 'slug' from out where name = 'delete'), 'hello', 'delete returns the slug');
select is((select count(*)::int from public.posts where slug = 'hello'), 0, 'the post is gone');
select is((select meta ->> 'title' from public.audit_events order by id desc limit 1), 'Hello',
          'the audit row keeps what was deleted');

-- ── Not the owner: every function finds nothing to change ────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_save_post((select id from ids where name = 'lesson'), 5, '{"title":"x"}')$$,
                 'PT404', null, 'the owner without 2FA cannot save');
select throws_ok($$select public.admin_create_post('life', 'X', 'x2', null, null, 'en')$$,
                 '42501', null, 'or create');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select public.admin_delete_post((select id from ids where name = 'lesson'))$$,
                 'PT404', null, 'another account cannot delete');
select is((select count(*)::int from public.admin_posts), 0, 'another account sees no posts in the admin list');

select * from finish();
rollback;
