-- Adding a section from the editor (ADM-12, the "add" part; rename/reorder/delete stay in M5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(not has_function_privilege('anon', 'public.admin_create_section(text,text,text,text)', 'execute'),
          'anon cannot call admin_create_section');

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.sections (subject_id, slug, title, sort)
  values ('math', 'inequalities', 'Inequalities', 1), ('math', 'sequences', 'Sequences', 4), ('physics', 'waves', 'Waves', 9);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

select lives_ok($$select public.admin_create_section('math', 'Functional equations', 'functional-equations', '')$$,
                'the owner adds a section');
select is((select sort from public.sections where slug = 'functional-equations'), 5,
          'it goes after the subject''s last section');
select is((select action from public.audit_events order by id desc limit 1), 'section.create', 'it is audited');
select throws_ok($$select public.admin_create_section('math', 'Again', 'inequalities', '')$$, '23505', null,
                 'a slug is unique within its subject');
select lives_ok($$select public.admin_create_section('physics', 'Inequalities in physics', 'inequalities', '')$$,
                'the same slug in another subject is fine');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_create_section('math', 'Sneaky', 'sneaky', '')$$, '42501', null,
                 'not without 2FA');

select * from finish();
rollback;
