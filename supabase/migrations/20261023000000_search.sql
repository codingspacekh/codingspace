-- M6 search (03 PUB-09): published posts only, titles ranked above summaries above body text,
-- and a per-visitor rate limit for the search page.

-- ── A weighted index: title (A) > summary (B) > body (C) ──────────────────
-- The column feeds public_posts, so the view is rebuilt around it (same definition as before).
drop view public.public_posts;
alter table public.posts drop column live_search;
alter table public.posts add column live_search tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(live_title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(live_summary, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(live_search_text, '')), 'C')
) stored;
create index posts_live_search on public.posts using gin (live_search) where status = 'published';
-- Snippets come from the body text; it is public once published (RLS: published rows only).
grant select (live_search, live_search_text) on public.posts to anon;

create view public.public_posts with (security_invoker = true) as
  select id, kind, slug, live_subject_id as subject_id, live_section_id as section_id, sort,
         live_level as level, live_minutes as minutes, live_problem_count as problem_count, live_lang as lang,
         live_title as title, live_summary as summary, live_html as html, live_toc as toc,
         live_has_math as has_math, live_has_code as has_code, live_search as search,
         published_at, coalesce(live_updated_at, published_at) as updated_at
  from public.posts
  where status = 'published';
revoke all on public.public_posts from anon, authenticated;
grant select on public.public_posts to anon, authenticated;

-- ── search_posts: the search page's query ─────────────────────────────────
-- Every word must match, the last ones as prefixes ("ineq" finds "inequality"). Khmer is
-- written without spaces between words, so Khmer queries also match anywhere in the text.
-- Snippets mark matches with U+0002 … U+0003; the page turns those into <mark> safely.
create or replace function public.search_posts(p_q text, p_limit integer default 20)
returns table (slug text, kind text, subject_id text, lang text, title text, summary text,
               published_at timestamptz, snippet text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select btrim(p_q) as raw,
           '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
           btrim(p_q) ~ '[ក-៿]' as khmer,
           (select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & '))
              from regexp_split_to_table(lower(btrim(p_q)), '[\s[:punct:]]+') w
             where w <> '') as tsq
  )
  select p.slug, p.kind, p.live_subject_id, p.live_lang, p.live_title, p.live_summary, p.published_at,
         case when q.tsq is null then left(p.live_search_text, 200)
              else ts_headline('simple', p.live_search_text, q.tsq,
                               format('StartSel=%s, StopSel=%s, MaxWords=26, MinWords=12, ShortWord=2, MaxFragments=1',
                                      chr(2), chr(3)))
         end as snippet,
         (coalesce(ts_rank_cd(p.live_search, q.tsq), 0)
          + case when p.live_title ilike q.pattern then 1 else 0 end)::real as rank
  from public.posts p, q
  where p.status = 'published'
    and char_length(q.raw) between 2 and 100
    and (p.live_search @@ q.tsq
         or p.live_title ilike q.pattern
         or (q.khmer and (p.live_summary ilike q.pattern or p.live_search_text ilike q.pattern)))
  order by rank desc, p.published_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.search_posts(text, integer) from public;
grant execute on function public.search_posts(text, integer) to anon, authenticated;

-- ── Rate limit: 30 searches a minute per visitor ──────────────────────────
-- The key is a salted hash of the visitor's IP address (made by the server); no address is stored.
-- Rows older than ten minutes are removed as new ones arrive.
create table private.search_hits (
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  minute timestamptz not null,
  hits integer not null default 1,
  primary key (key, minute)
);

create or replace function public.search_rate_ok(p_key text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  insert into private.search_hits (key, minute) values (p_key, date_trunc('minute', now()))
    on conflict (key, minute) do update set hits = private.search_hits.hits + 1
    returning hits into n;
  delete from private.search_hits where minute < now() - interval '10 minutes';
  return n <= 30;
end;
$$;
revoke all on function public.search_rate_ok(text) from public;
grant execute on function public.search_rate_ok(text) to anon, authenticated;
