-- v1.1 owner analytics (04 "After launch", NFR-PRIV-1): page views, visitors, reading time,
-- sources, devices and countries, without cookies or anything stored in the browser.
--
-- A visitor is a hash of (the server's hash of IP address + browser) with a random salt that
-- changes every day and is deleted the next day, so nobody (not even the owner) can link a
-- visitor across days or turn a hash back into an address. Page views are kept for 90 days;
-- each finished day also keeps its totals for good (the dashboard's months).
-- Days are Cambodian days (Asia/Phnom_Penh), like the owner's.

create table private.analytics_salts (
  day date primary key,
  salt text not null default gen_random_uuid()::text || gen_random_uuid()::text
);

create table private.page_views (
  id uuid primary key,
  at timestamptz not null default now(),
  day date not null,
  visitor text not null check (visitor ~ '^[0-9a-f]{64}$'),
  path text not null check (char_length(path) <= 200 and path ~ '^/([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*)?$'),
  source text check (char_length(source) between 1 and 100),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  country text check (country ~ '^[A-Z]{2}$'),
  seconds integer not null default 0 check (seconds between 0 and 1800)
);
create index page_views_day_visitor on private.page_views (day, visitor);

create table private.analytics_days (
  day date primary key,
  views integer not null,
  visitors integer not null,
  seconds bigint not null,
  timed integer not null
);

alter table private.analytics_salts enable row level security;
alter table private.page_views enable row level security;
alter table private.analytics_days enable row level security;
-- The owner reads (through admin_analytics); nobody writes except track_view / track_time.
create policy page_views_owner_read on private.page_views for select to authenticated using (private.is_owner());
create policy analytics_days_owner_read on private.analytics_days for select to authenticated using (private.is_owner());
grant select on private.page_views, private.analytics_days to authenticated;

create or replace function private.analytics_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Phnom_Penh')::date;
$$;
revoke all on function private.analytics_today() from public;
grant execute on function private.analytics_today() to authenticated;

-- ── track_view: one page view (called by /api/visit with the anon key) ────
-- p_client is the server's sha256 of address + browser; it is salted again here and dropped.
-- Refused (false): bad input, more than 300 views a day from one visitor, more than 50 000 a day
-- in all (a flood can't fill the database). The first view of a day also tidies up: it rolls
-- the finished days into analytics_days, deletes views past 90 days and old salts.
create or replace function public.track_view(p_id uuid, p_client text, p_path text, p_source text,
                                             p_device text, p_country text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_day date := private.analytics_today();
  v_salt text;
  v_visitor text;
  v_new_day boolean;
begin
  if p_id is null or p_client is null or p_client !~ '^[0-9a-f]{64}$'
     or p_path is null or char_length(p_path) > 200
     or p_path !~ '^/([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*)?$'
     or (p_source is not null and char_length(p_source) not between 1 and 100)
     or p_device is null or p_device not in ('mobile', 'tablet', 'desktop')
     or (p_country is not null and p_country !~ '^[A-Z]{2}$') then
    return false;
  end if;

  insert into private.analytics_salts (day) values (v_day) on conflict (day) do nothing;
  v_new_day := found;
  if v_new_day then
    insert into private.analytics_days (day, views, visitors, seconds, timed)
      select day, count(*), count(distinct visitor), sum(seconds), count(*) filter (where seconds > 0)
      from private.page_views
      where day < v_day
      group by day
      on conflict (day) do nothing;
    delete from private.page_views where day <= v_day - 90;
    delete from private.analytics_salts where day < v_day;
  end if;

  select salt into v_salt from private.analytics_salts where day = v_day;
  v_visitor := encode(sha256(convert_to(v_salt || ':' || p_client, 'UTF8')), 'hex');

  if (select count(*) from private.page_views where day = v_day and visitor = v_visitor) >= 300
     or (select count(*) from private.page_views where day = v_day) >= 50000 then
    return false;
  end if;

  insert into private.page_views (id, day, visitor, path, source, device, country)
    values (p_id, v_day, v_visitor, p_path, p_source, p_device, p_country)
    on conflict (id) do nothing;
  return found;
end;
$$;
revoke all on function public.track_view(uuid, text, text, text, text, text) from public;
grant execute on function public.track_view(uuid, text, text, text, text, text) to anon, authenticated;

-- ── track_time: how long the page was on screen (seconds so far; only ever goes up) ──
create or replace function public.track_time(p_id uuid, p_seconds integer)
returns void language sql volatile security definer set search_path = '' as $$
  update private.page_views
     set seconds = greatest(seconds, least(p_seconds, 1800))
   where id = p_id and p_seconds > 0 and at > now() - interval '1 day';
$$;
revoke all on function public.track_time(uuid, integer) from public;
grant execute on function public.track_time(uuid, integer) to anon, authenticated;

-- ── admin_analytics: the dashboard in one read (owner only, through RLS) ──
-- Range: the last p_days days (1–90), today included. "visitors" adds up each day's visitors.
create or replace function public.admin_analytics(p_days integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with r as (
    select private.analytics_today() as today, least(greatest(coalesce(p_days, 30), 1), 90) as n
  ),
  -- Every day's totals: from the views while they are kept, then from analytics_days.
  daily as (
    select day, count(*)::int as views, count(distinct visitor)::int as visitors,
           coalesce(sum(seconds), 0)::bigint as seconds, (count(*) filter (where seconds > 0))::int as timed
    from private.page_views group by day
    union all
    select d.day, d.views, d.visitors, d.seconds, d.timed
    from private.analytics_days d
    where not exists (select 1 from private.page_views v where v.day = d.day)
  ),
  v as (
    select pv.* from private.page_views pv, r where pv.day > r.today - r.n
  ),
  pages as (
    select v.path, count(*)::int as views, count(distinct (v.day, v.visitor))::int as visitors,
           coalesce(sum(v.seconds) filter (where v.seconds > 0), 0)::bigint as seconds,
           (count(*) filter (where v.seconds > 0))::int as timed
    from v group by v.path
  ),
  page_info as (
    select pg.*, p.live_title as title,
           coalesce(p.live_subject_id, substring(pg.path from '^/study/([a-z]+)$')) as subject_id
    from pages pg
    left join public.posts p on pg.path = '/posts/' || p.slug
  )
  select jsonb_build_object(
    'today', (select today from r),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'views', coalesce(d.views, 0),
                                                   'visitors', coalesce(d.visitors, 0),
                                                   'seconds', coalesce(d.seconds, 0), 'timed', coalesce(d.timed, 0))
                                order by g.day), '[]'::jsonb)
      from r, generate_series(r.today - r.n + 1, r.today, interval '1 day') as g0(t)
      cross join lateral (select g0.t::date as day) g
      left join daily d on d.day = g.day),
    'previous', (
      select jsonb_build_object('views', coalesce(sum(d.views), 0), 'visitors', coalesce(sum(d.visitors), 0),
                                'seconds', coalesce(sum(d.seconds), 0), 'timed', coalesce(sum(d.timed), 0))
      from daily d, r where d.day > r.today - 2 * r.n and d.day <= r.today - r.n),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'views', m.views, 'visitors', m.visitors)
                                order by m.month desc), '[]'::jsonb)
      from (select to_char(date_trunc('month', d.day), 'YYYY-MM') as month,
                   sum(d.views)::int as views, sum(d.visitors)::int as visitors
            from daily d, r where d.day > (date_trunc('month', r.today) - interval '11 months')::date
            group by 1) m),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('path', t.path, 'title', t.title, 'subject', t.subject_id,
                                                   'views', t.views, 'visitors', t.visitors,
                                                   'seconds', t.seconds, 'timed', t.timed)
                                order by t.views desc, t.path), '[]'::jsonb)
      from (select * from page_info order by views desc, path limit 20) t),
    'subjects', (
      select coalesce(jsonb_agg(jsonb_build_object('subject', s.subject_id, 'views', s.views)
                                order by s.views desc, s.subject_id), '[]'::jsonb)
      from (select subject_id, sum(views)::int as views from page_info
            where subject_id is not null group by subject_id) s),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'views', s.views)
                                order by s.views desc, s.source nulls first), '[]'::jsonb)
      from (select source, count(*)::int as views from v group by source order by 2 desc, 1 nulls first limit 10) s),
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('device', s.device, 'views', s.views)
                                order by s.views desc, s.device), '[]'::jsonb)
      from (select device, count(*)::int as views from v group by device) s),
    'countries', (
      select coalesce(jsonb_agg(jsonb_build_object('country', s.country, 'views', s.views)
                                order by s.views desc, s.country nulls last), '[]'::jsonb)
      from (select country, count(*)::int as views from v group by country order by 2 desc, 1 nulls last limit 10) s)
  );
$$;
revoke all on function public.admin_analytics(integer) from public;
grant execute on function public.admin_analytics(integer) to authenticated;
