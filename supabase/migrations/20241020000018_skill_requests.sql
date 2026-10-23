-- Briefcase checkmarks -> owner approval. Records consent only; nothing transfers automatically.
-- direction = 'receive': requester bot's owner wants a skill from source bot; source bot's owner approves.
-- direction = 'transfer': source bot's owner offers a skill to requester bot; requester bot's owner approves.
create table if not exists public.skill_requests (
  id uuid primary key default gen_random_uuid(),
  requester_bot_id uuid not null references public.bots(id) on delete cascade,
  source_bot_id uuid not null references public.bots(id) on delete cascade,
  skill_id text not null check (char_length(skill_id) between 1 and 100),
  skill_name text check (char_length(skill_name) <= 200),
  direction text not null check (direction in ('receive','transfer')),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  meetup_id uuid references public.meetups(id) on delete set null,
  created_by uuid not null default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_bot_id <> source_bot_id)
);

create unique index if not exists skill_requests_one_pending
  on public.skill_requests (requester_bot_id, source_bot_id, skill_id, direction)
  where status = 'pending';
create index if not exists skill_requests_source_idx on public.skill_requests (source_bot_id);
create index if not exists skill_requests_requester_idx on public.skill_requests (requester_bot_id);

alter table public.skill_requests enable row level security;

-- Only owners of the two bots can see a row.
create policy skill_requests_select on public.skill_requests
  for select to authenticated using (
    public.user_owns_bot(auth.uid(), requester_bot_id) or public.user_owns_bot(auth.uid(), source_bot_id)
  );

-- The initiating owner may create pending rows for their own side.
create policy skill_requests_insert on public.skill_requests
  for insert to authenticated with check (
    status = 'pending' and decided_by is null and decided_at is null and created_by = auth.uid()
    and (
      (direction = 'receive' and public.user_owns_bot(auth.uid(), requester_bot_id)
        and public.user_shares_meetup_with_bot(auth.uid(), source_bot_id))
      or (direction = 'transfer' and public.user_owns_bot(auth.uid(), source_bot_id)
        and public.user_shares_meetup_with_bot(auth.uid(), requester_bot_id))
    )
  );

-- No direct UPDATE/DELETE policies: status changes only through decide_skill_request,
-- which lets only the approving owner act.
create or replace function public.skill_request_approver_bot(r public.skill_requests)
returns uuid language sql immutable set search_path = public as $$
  select case when r.direction = 'receive' then r.source_bot_id else r.requester_bot_id end;
$$;

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
  update public.skill_requests
     set status = p_status, decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_id returning * into r;
  return r;
end $$;

revoke all on function public.decide_skill_request(uuid, text) from public, anon;
grant execute on function public.decide_skill_request(uuid, text) to authenticated;
grant select, insert on public.skill_requests to authenticated;
