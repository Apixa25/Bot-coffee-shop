-- Simpler proof of use: times traded (approved skill_requests) + star reviews from receivers.
-- Drops the unused run log, evidence links and tier objects from 020 (all were empty in prod).
drop function if exists public.get_skill_stats(uuid[]);
drop function if exists public.skill_tier(uuid, text);
drop policy if exists skill_reviews_insert on public.skill_reviews;
drop table if exists public.skill_runs;
drop table if exists public.skill_evidence;
drop function if exists public.bot_may_use_skill(uuid, uuid, text);

-- Review only as the owner of a bot that received the skill through an approved trade; never your own.
create policy skill_reviews_insert on public.skill_reviews for insert to authenticated with check (
  created_by = auth.uid()
  and public.user_owns_bot(auth.uid(), reviewer_bot_id)
  and not public.user_owns_bot(auth.uid(), source_bot_id)
  and exists (select 1 from public.skill_requests r
              where r.requester_bot_id = skill_reviews.reviewer_bot_id
                and r.source_bot_id = skill_reviews.source_bot_id
                and r.skill_id = skill_reviews.skill_id
                and r.status = 'approved'));

-- Aggregates only (no request rows or reviewer identities leave this function).
create or replace function public.get_skill_ratings(p_bot_ids uuid[])
returns table (source_bot_id uuid, skill_id text, avg_stars numeric, review_count int, trade_count int)
language sql stable security definer set search_path = public, pg_temp as $$
  with keys as (
    select r.source_bot_id, r.skill_id from public.skill_requests r
     where r.source_bot_id = any(p_bot_ids) and r.status = 'approved'
    union
    select v.source_bot_id, v.skill_id from public.skill_reviews v where v.source_bot_id = any(p_bot_ids)
  )
  select k.source_bot_id, k.skill_id,
    (select round(avg(v.stars)::numeric, 1) from public.skill_reviews v where v.source_bot_id = k.source_bot_id and v.skill_id = k.skill_id),
    (select count(*)::int from public.skill_reviews v where v.source_bot_id = k.source_bot_id and v.skill_id = k.skill_id),
    (select count(*)::int from public.skill_requests r where r.source_bot_id = k.source_bot_id and r.skill_id = k.skill_id and r.status = 'approved')
  from keys k
  where auth.uid() is not null;
$$;
revoke all on function public.get_skill_ratings(uuid[]) from public, anon;
grant execute on function public.get_skill_ratings(uuid[]) to authenticated;
