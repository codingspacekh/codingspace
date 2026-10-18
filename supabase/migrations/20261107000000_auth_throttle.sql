-- Sign-in throttling per visitor (code review 2026-10-18). Sign-in and 2FA calls reach Supabase
-- Auth from the server's address, so its per-address limits are shared by everyone: one attacker
-- could use them up and keep the owner out. The app counts each visitor's FAILED attempts (a wrong
-- password or code) here, keyed by a salted hash of their address (no address is stored), and
-- pauses that visitor after too many. Successful sign-ins never count. Only the server's service
-- role can call these, so nobody can fill another visitor's count. Additive.

create table private.auth_failures (
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  minute timestamptz not null,
  failures integer not null default 1 check (failures > 0),
  primary key (key, minute)
);

-- Failures from this visitor in the last p_minutes.
create or replace function public.auth_failures_recent(p_key text, p_minutes integer default 15)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(failures), 0)::int from private.auth_failures
    where key = p_key and minute > now() - make_interval(mins => greatest(1, least(p_minutes, 1440)));
$$;

-- Records one failure; old rows go (a day is more than any window). Returns the last 15 minutes' total.
create or replace function public.auth_record_failure(p_key text)
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'bad key' using errcode = 'PT422';
  end if;
  insert into private.auth_failures (key, minute) values (p_key, date_trunc('minute', now()))
    on conflict (key, minute) do update set failures = private.auth_failures.failures + 1;
  delete from private.auth_failures where minute < now() - interval '1 day';
  return public.auth_failures_recent(p_key, 15);
end;
$$;

revoke all on function public.auth_failures_recent(text, integer), public.auth_record_failure(text)
  from public, anon, authenticated;
grant execute on function public.auth_failures_recent(text, integer), public.auth_record_failure(text)
  to service_role;
