-- Search (03 PUB-09): published posts only, title above body, prefix and Khmer matches, rate limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.sections (id, subject_id, slug, title, sort)
  values ('10000000-0000-0000-0000-000000000001', 'math', 'inequalities', 'Inequalities', 1);
-- One post has the word in its title, one only in its body, one is a draft that mentions it everywhere.
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, live_summary,
                          live_search_text, published_at, live_revision, live_subject_id, live_section_id,
                          live_level, live_minutes, live_problem_count, live_lang)
  values ('20000000-0000-0000-0000-000000000001', 'lesson', 'body-only', 'math', '10000000-0000-0000-0000-000000000001',
          'published', 'Means', 'Means', 'Averages.',
          'A long lesson. The Cauchy inequality appears here, deep in the body text.', now() - interval '1 day',
          1, 'math', '10000000-0000-0000-0000-000000000001', 1, 5, 0, 'en'),
         ('20000000-0000-0000-0000-000000000002', 'lesson', 'in-title', 'math', '10000000-0000-0000-0000-000000000001',
          'published', 'Cauchy–Schwarz', 'The Cauchy–Schwarz inequality', 'Sums of products.',
          'Vectors and dot products.', now() - interval '2 days',
          1, 'math', '10000000-0000-0000-0000-000000000001', 1, 5, 0, 'en'),
         ('20000000-0000-0000-0000-000000000004', 'life', 'study-tips-km', null, null,
          'published', 'Tips', 'គន្លឹះសិក្សាសម្រាប់សិស្ស', 'គន្លឹះ', 'អានរៀងរាល់ថ្ងៃ ហើយសួរសំណួរ', now(),
          1, null, null, 1, 3, 0, 'km');
insert into public.posts (id, kind, slug, subject_id, section_id, status, title, live_title, live_search_text)
  values ('20000000-0000-0000-0000-000000000003', 'lesson', 'secret-draft', 'math',
          '10000000-0000-0000-0000-000000000001', 'draft', 'Cauchy draft', 'Cauchy Cauchy', 'Cauchy Cauchy Cauchy');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq($$select slug from public.search_posts('cauchy')$$,
                  $$values ('in-title'::text), ('body-only')$$,
                  'a title match ranks above a body match; drafts never appear');
select results_eq($$select slug from public.search_posts('cauch ineq')$$,
                  $$values ('in-title'::text), ('body-only')$$, 'every word must match, as a prefix');
select is((select count(*)::int from public.search_posts('cauchy vectors zebra')), 0, 'a word that matches nothing excludes');
select ok((select snippet from public.search_posts('cauchy') where slug = 'body-only') like '%' || chr(2) || 'Cauchy' || chr(3) || '%',
          'the snippet marks the match');
select results_eq($$select slug from public.search_posts('សិក្សា')$$, $$values ('study-tips-km'::text)$$,
                  'Khmer matches inside words (no spaces between Khmer words)');
select results_eq($$select slug from public.search_posts('រៀងរាល់')$$, $$values ('study-tips-km'::text)$$,
                  'and inside the body text');
select is((select count(*)::int from public.search_posts('c')), 0, 'one character is too short to search');
select is((select count(*)::int from public.search_posts('100%_\')), 0, 'LIKE wildcards are literal (and nothing breaks)');
select is((select count(*)::int from public.search_posts($$'); drop table posts; --$$)), 0, 'SQL in the query is just text');
select is((select count(*)::int from public.search_posts('cauchy', 1)), 1, 'the limit applies');

-- Rate limit: 30 a minute per key.
select is((select bool_and(public.search_rate_ok(repeat('a', 64))) from generate_series(1, 30)), true,
          '30 searches a minute are fine');
select is(public.search_rate_ok(repeat('a', 64)), false, 'the 31st is refused');

select * from finish();
rollback;
