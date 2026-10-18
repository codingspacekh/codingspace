-- v1.1 questions on lessons (owner request 2026-10-18; 01 §3.3 FR-30–FR-36, simplified by the
-- owner): no login. A student asks a question under a lesson with a name; nothing is shown until
-- the owner approves it in the admin, where they also answer it (marked "Teacher"). No email, no
-- student replies: a follow-up is a new question. Spam protection: a honeypot field (server),
-- 5 questions an hour per visitor, 300 a day in all, at most 2 links.

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Markdown, rendered by the same safe renderer as lessons when the page is built.
  body text not null check (length(btrim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  answer text not null default '' check (length(answer) <= 4000),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  answered_at timestamptz
);
create index questions_post on public.questions (post_id, created_at) where status = 'published';
create index questions_pending on public.questions (created_at) where status = 'pending';

alter table public.questions enable row level security;
revoke all on public.questions from anon, authenticated;
-- Visitors read approved questions on lessons they can see (posts' own RLS); they never write
-- directly, only through ask_question().
grant select (id, post_id, name, body, answer, published_at, answered_at) on public.questions to anon;
create policy questions_read on public.questions for select to anon
  using (status = 'published' and exists (select 1 from public.posts p where p.id = post_id));
grant select, update, delete on public.questions to authenticated;
create policy questions_owner on public.questions for all to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

-- ── Rate limit: a salted hash of the visitor, per hour (no address stored) ─
create table private.question_hits (
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  hour timestamptz not null,
  hits integer not null default 1,
  primary key (key, hour)
);

-- Returns 'ok', 'limited' (too many) or 'not_found' (no such live lesson). Validation the
-- server already did is checked again here: this is the only way in.
create or replace function public.ask_question(p_slug text, p_name text, p_body text, p_key text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  lesson uuid;
  n integer;
  this_hour timestamptz := date_trunc('hour', now());
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'bad key' using errcode = 'PT422';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60
     or length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'a name and a question are needed' using errcode = 'PT422';
  end if;
  if (select count(*) from regexp_matches(p_body, 'https?://|www\.', 'gi')) > 2 then
    raise exception 'at most 2 links in a question' using errcode = 'PT422';
  end if;

  -- A published lesson in a shown subject (what visitors can open).
  select p.id into lesson from public.posts p
    join public.subjects s on s.id = p.live_subject_id and s.visible
    where p.slug = p_slug and p.kind = 'lesson' and p.status = 'published';
  if lesson is null then
    return 'not_found';
  end if;

  delete from private.question_hits h where h.hour < now() - interval '2 hours';
  insert into private.question_hits (key, hour) values (p_key, this_hour)
    on conflict (key, hour) do update set hits = private.question_hits.hits + 1
    returning hits into n;
  if n > 5 or (select count(*) from public.questions where created_at > now() - interval '1 day') >= 300 then
    return 'limited';
  end if;

  insert into public.questions (post_id, name, body) values (lesson, btrim(p_name), btrim(p_body));
  return 'ok';
end;
$$;
revoke all on function public.ask_question(text, text, text, text) from public;
grant execute on function public.ask_question(text, text, text, text) to anon, authenticated;

-- ── Admin ─────────────────────────────────────────────────────────────────
-- p: { status (pending | published | hidden), answer }. Returns the lesson's slug (its page
-- changes when a question is shown, hidden or answered).
create or replace function public.admin_save_question(p_id uuid, p jsonb)
returns text language plpgsql set search_path = '' as $$
declare
  q public.questions;
  new_status text := coalesce(p ->> 'status', 'pending');
  new_answer text := btrim(coalesce(p ->> 'answer', ''));
  slug text;
begin
  select * into q from public.questions where id = p_id for update;
  if q.id is null then
    raise exception 'question not found' using errcode = 'PT404';
  end if;
  if new_status not in ('pending', 'published', 'hidden') then
    raise exception 'unknown status' using errcode = 'PT422';
  end if;
  update public.questions set
    status = new_status,
    answer = new_answer,
    published_at = case when new_status = 'published' then coalesce(q.published_at, now()) else q.published_at end,
    answered_at = case when new_answer = '' then null
                       when new_answer is distinct from q.answer then now() else q.answered_at end
    where id = p_id;
  select p2.slug into slug from public.posts p2 where p2.id = q.post_id;
  perform private.audit_site('question.' || case
      when new_status = 'published' and q.status <> 'published' then 'publish'
      when new_status = 'hidden' and q.status <> 'hidden' then 'hide'
      else 'answer' end,
    'question', p_id::text, jsonb_build_object('name', q.name, 'lesson', slug));
  return slug;
end;
$$;

create or replace function public.admin_delete_question(p_id uuid)
returns text language plpgsql set search_path = '' as $$
declare
  gone public.questions;
  slug text;
begin
  delete from public.questions where id = p_id returning * into gone;
  if gone.id is null then
    raise exception 'question not found' using errcode = 'PT404';
  end if;
  select p.slug into slug from public.posts p where p.id = gone.post_id;
  perform private.audit_site('question.delete', 'question', p_id::text, jsonb_build_object('name', gone.name, 'lesson', slug));
  return slug;
end;
$$;

revoke all on function public.admin_save_question(uuid, jsonb), public.admin_delete_question(uuid) from public;
grant execute on function public.admin_save_question(uuid, jsonb), public.admin_delete_question(uuid) to authenticated;
