-- v1.1 comments on life posts (owner request 2026-10-18): the same rules as questions on lessons
-- (20261104000000). The same table and functions: on a life post a "question" is shown as a
-- comment and the owner's answer as the reply. Held until the owner approves it; honeypot,
-- 5 an hour per visitor and 300 a day in all (questions and comments together), at most 2 links.
-- Only the functions change (create or replace): nothing to migrate.

create or replace function public.ask_question(p_slug text, p_name text, p_body text, p_key text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  target uuid;
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

  -- What visitors can open: a published life post, or a published lesson in a shown subject.
  select p.id into target from public.posts p
    left join public.subjects s on s.id = p.live_subject_id
    where p.slug = p_slug and p.status = 'published'
      and (p.kind = 'life' or (p.kind = 'lesson' and s.visible));
  if target is null then
    return 'not_found';
  end if;

  delete from private.question_hits h where h.hour < now() - interval '2 hours';
  insert into private.question_hits (key, hour) values (p_key, this_hour)
    on conflict (key, hour) do update set hits = private.question_hits.hits + 1
    returning hits into n;
  if n > 5 or (select count(*) from public.questions where created_at > now() - interval '1 day') >= 300 then
    return 'limited';
  end if;

  insert into public.questions (post_id, name, body) values (target, btrim(p_name), btrim(p_body));
  return 'ok';
end;
$$;

-- As before, plus the post's kind in the audit entry (the activity says "question" or "comment").
create or replace function public.admin_save_question(p_id uuid, p jsonb)
returns text language plpgsql set search_path = '' as $$
declare
  q public.questions;
  new_status text := coalesce(p ->> 'status', 'pending');
  new_answer text := btrim(coalesce(p ->> 'answer', ''));
  post public.posts;
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
  select * into post from public.posts p2 where p2.id = q.post_id;
  perform private.audit_site('question.' || case
      when new_status = 'published' and q.status <> 'published' then 'publish'
      when new_status = 'hidden' and q.status <> 'hidden' then 'hide'
      else 'answer' end,
    'question', p_id::text, jsonb_build_object('name', q.name, 'lesson', post.slug, 'kind', post.kind));
  return post.slug;
end;
$$;

create or replace function public.admin_delete_question(p_id uuid)
returns text language plpgsql set search_path = '' as $$
declare
  gone public.questions;
  post public.posts;
begin
  delete from public.questions where id = p_id returning * into gone;
  if gone.id is null then
    raise exception 'question not found' using errcode = 'PT404';
  end if;
  select * into post from public.posts p where p.id = gone.post_id;
  perform private.audit_site('question.delete', 'question', p_id::text,
    jsonb_build_object('name', gone.name, 'lesson', post.slug, 'kind', post.kind));
  return post.slug;
end;
$$;
