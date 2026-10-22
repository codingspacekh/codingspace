-- Subject icons (2026-10-23): a subject shows its symbol until the owner picks an icon.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is((select count(*)::int from public.subjects where icon = ''), (select count(*)::int from public.subjects),
          'every subject keeps its symbol until an icon is picked');

insert into private.owner (user_id) values ('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);

select public.admin_save_subject('physics', '{"name":"Physics","glyph":"Ψ","icon":"physics","color":"violet"}');
select results_eq($$select glyph, icon from public.subjects where id = 'physics'$$,
                  $$values ('Ψ'::text, 'physics'::text)$$, 'the owner picks an icon; the symbol is kept');

select public.admin_save_subject('physics', '{"name":"Physics","glyph":"Ψ","color":"violet"}');
select is((select icon from public.subjects where id = 'physics'), '', 'leaving it out goes back to the symbol');

select is(public.admin_save_subject(null, '{"id":"chemistry","name":"Chemistry","glyph":"⚗","icon":"robotics"}'),
          'chemistry', 'a new subject can have an icon');
select throws_ok($$select public.admin_save_subject('physics', '{"name":"Physics","icon":"<svg>"}')$$,
                 '23514', null, 'an icon is a name, nothing else');

select * from finish();
rollback;
