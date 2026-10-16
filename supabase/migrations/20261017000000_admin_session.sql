-- M3 admin sessions (03 ADM-01, §8.3). Every admin API request calls public.admin_touch() first:
--   'forbidden' → not the owner, or no 2FA (AAL1)            → 403
--   'revoked'   → the session was signed out (or never had one) → 401
--   'expired'   → no activity for 12 h                         → 401, and the app signs it out
--   'ok'        → activity recorded
-- Supabase's own idle timeout needs the Pro plan, so the app enforces it here.

create table private.admin_activity (
  session_id uuid primary key,
  last_seen timestamptz not null default now()
);
comment on table private.admin_activity is 'Last admin request per auth session, for the 12 h idle timeout.';

create or replace function public.admin_touch()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sid uuid;
  started timestamptz;
  seen timestamptz;
begin
  if not private.is_owner() then
    return 'forbidden';
  end if;

  begin
    sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    sid := null;
  end;

  -- "Sign out everywhere" deletes the sessions; their access tokens stop working here at once.
  select s.created_at into started from auth.sessions s where s.id = sid;
  if sid is null or not found then
    return 'revoked';
  end if;

  select a.last_seen into seen from private.admin_activity a where a.session_id = sid for update;
  if coalesce(seen, started, now()) < now() - interval '12 hours' then
    return 'expired';
  end if;

  insert into private.admin_activity (session_id, last_seen) values (sid, now())
    on conflict (session_id) do update set last_seen = excluded.last_seen;
  -- Rows for sessions that are long gone.
  delete from private.admin_activity where last_seen < now() - interval '30 days';
  return 'ok';
end;
$$;

revoke all on function public.admin_touch() from public, anon, authenticated;
grant execute on function public.admin_touch() to authenticated;
