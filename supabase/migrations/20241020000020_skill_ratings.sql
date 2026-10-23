-- Proof of use + star ratings. Additive: new tables, functions, a trigger, and a stricter
-- decide_skill_request (experimental skills can't be offered or approved).

-- 1. Run log ---------------------------------------------------------------
create table if not exists public.skill_runs (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,        -- bot that ran it
  source_bot_id uuid not null references public.bots(id) on delete cascade, -- bot whose skill it is
  skill_id text not null check (char_length(skill_id) between 1 and 100),
  outcome text not null check (outcome in ('success','partial','failed')),
  ran_on date not null default current_date,
  note text check (char_length(note) <= 300),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists skill_runs_skill_idx on public.skill_runs (source_bot_id, skill_id);

-- Bot may log a run of a skill it owns, or one it received via an approved request.
create or replace function public.bot_may_use_skill(p_bot uuid, p_source uuid, p_skill text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_bot = p_source or exists (
    select 1 from public.skill_requests r
    where r.requester_bot_id = p_bot and r.source_bot_id = p_source
      and r.skill_id = p_skill and r.status = 'approved');
$$;

alter table public.skill_runs enable row level security;
create policy skill_runs_select on public.skill_runs for select to authenticated using (
  public.user_owns_bot(auth.uid(), bot_id) or public.user_owns_bot(auth.uid(), source_bot_id));
create policy skill_runs_insert on public.skill_runs for insert to authenticated with check (
  created_by = auth.uid() and public.user_owns_bot(auth.uid(), bot_id)
  and public.bot_may_use_skill(bot_id, source_bot_id, skill_id));
grant select, insert on public.skill_runs to authenticated;

-- 2. Reviews ---------------------------------------------------------------
create table if not exists public.skill_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_bot_id uuid not null references public.bots(id) on delete cascade,
  source_bot_id uuid not null references public.bots(id) on delete cascade,
  skill_id text not null check (char_length(skill_id) between 1 and 100),
  stars int not null check (stars between 1 and 5),
  body text not null default '' check (char_length(body) <= 500),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (reviewer_bot_id, source_bot_id, skill_id),
  check (reviewer_bot_id <> source_bot_id)
);
alter table public.skill_reviews enable row level security;
create policy skill_reviews_select on public.skill_reviews for select to authenticated using (true);
-- Only the owner of a bot that received the skill (approved request) AND logged a run; never your own skill.
create policy skill_reviews_insert on public.skill_reviews for insert to authenticated with check (
  created_by = auth.uid()
  and public.user_owns_bot(auth.uid(), reviewer_bot_id)
  and not public.user_owns_bot(auth.uid(), source_bot_id)
  and exists (select 1 from public.skill_requests r where r.requester_bot_id = reviewer_bot_id
              and r.source_bot_id = skill_reviews.source_bot_id and r.skill_id = skill_reviews.skill_id and r.status = 'approved')
  and exists (select 1 from public.skill_runs x where x.bot_id = reviewer_bot_id
              and x.source_bot_id = skill_reviews.source_bot_id and x.skill_id = skill_reviews.skill_id));
grant select, insert on public.skill_reviews to authenticated;

-- 3. Linked evidence (commits / PRs / releases) ----------------------------
create table if not exists public.skill_evidence (
  id uuid primary key default gen_random_uuid(),
  source_bot_id uuid not null references public.bots(id) on delete cascade,
  skill_id text not null check (char_length(skill_id) between 1 and 100),
  kind text not null check (kind in ('commit','pr','release')),
  url text not null check (url ~ '^https://github\.com/' and char_length(url) <= 300),
  verified boolean not null default false,
  verified_at timestamptz,
  check_detail text check (char_length(check_detail) <= 200),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source_bot_id, skill_id, url)
);
alter table public.skill_evidence enable row level security;
create policy skill_evidence_select on public.skill_evidence for select to authenticated using (true);
-- Owners add evidence unverified; only the server (service role) marks it verified.
create policy skill_evidence_insert on public.skill_evidence for insert to authenticated with check (
  created_by = auth.uid() and public.user_owns_bot(auth.uid(), source_bot_id)
  and verified = false and verified_at is null);
grant select, insert on public.skill_evidence to authenticated;

-- 4. Stats + tier ------------------------------------------------------------
create or replace function public.skill_tier(p_source uuid, p_skill text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when (select count(distinct reviewer_bot_id) from public.skill_reviews
          where source_bot_id = p_source and skill_id = p_skill) >= 2 then 'verified'
    when exists (select 1 from public.skill_runs where source_bot_id = p_source and skill_id = p_skill)
     and exists (select 1 from public.skill_evidence where source_bot_id = p_source and skill_id = p_skill) then 'used_by_owner'
    else 'experimental' end;
$$;

create or replace function public.get_skill_stats(p_bot_ids uuid[])
returns table (source_bot_id uuid, skill_id text, avg_stars numeric, review_count int,
               run_count int, success_count int, evidence jsonb, tier text)
language sql stable security definer set search_path = public, pg_temp as $$
  with keys as (
    select source_bot_id, skill_id from public.skill_runs where source_bot_id = any(p_bot_ids)
    union select source_bot_id, skill_id from public.skill_reviews where source_bot_id = any(p_bot_ids)
    union select source_bot_id, skill_id from public.skill_evidence where source_bot_id = any(p_bot_ids))
  select k.source_bot_id, k.skill_id,
    (select round(avg(stars)::numeric, 1) from public.skill_reviews v where v.source_bot_id = k.source_bot_id and v.skill_id = k.skill_id),
    (select count(*)::int from public.skill_reviews v where v.source_bot_id = k.source_bot_id and v.skill_id = k.skill_id),
    (select count(*)::int from public.skill_runs r where r.source_bot_id = k.source_bot_id and r.skill_id = k.skill_id),
    (select count(*)::int from public.skill_runs r where r.source_bot_id = k.source_bot_id and r.skill_id = k.skill_id and r.outcome = 'success'),
    coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'url', e.url, 'verified', e.verified) order by e.created_at)
              from public.skill_evidence e where e.source_bot_id = k.source_bot_id and e.skill_id = k.skill_id), '[]'::jsonb),
    public.skill_tier(k.source_bot_id, k.skill_id)
  from keys k
  where auth.uid() is not null;
$$;

-- 5. Experimental skills can't be offered/requested or approved ---------------
create or replace function public.skill_requests_block_experimental()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.skill_tier(new.source_bot_id, new.skill_id) = 'experimental' then
    raise exception 'experimental skills cannot be traded yet (log runs and evidence first)';
  end if;
  return new;
end $$;
drop trigger if exists skill_requests_block_experimental on public.skill_requests;
create trigger skill_requests_block_experimental before insert on public.skill_requests
  for each row execute function public.skill_requests_block_experimental();

create or replace function public.decide_skill_request(p_id uuid, p_status text)
returns public.skill_requests
language plpgsql security definer set search_path = public as $$
declare r public.skill_requests;
begin
  if p_status not in ('approved','declined') then
    raise exception 'status must be approved or declined';
  end if;
  select * into r from public.skill_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not public.user_owns_bot(auth.uid(), public.skill_request_approver_bot(r)) then
    raise exception 'only the approving owner can decide this request';
  end if;
  if r.status <> 'pending' then raise exception 'request already decided'; end if;
  if p_status = 'approved' and public.skill_tier(r.source_bot_id, r.skill_id) = 'experimental' then
    raise exception 'experimental skills cannot be approved for trade yet';
  end if;
  update public.skill_requests
     set status = p_status, decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_id returning * into r;
  return r;
end $$;

revoke all on function public.bot_may_use_skill(uuid, uuid, text) from public, anon;
revoke all on function public.skill_tier(uuid, text) from public, anon;
revoke all on function public.get_skill_stats(uuid[]) from public, anon;
revoke all on function public.skill_requests_block_experimental() from public, anon;
grant execute on function public.bot_may_use_skill(uuid, uuid, text) to authenticated;
grant execute on function public.skill_tier(uuid, text) to authenticated;
grant execute on function public.get_skill_stats(uuid[]) to authenticated;
