-- Remove the Experimental/tier trade gate added in 020. Requests and approvals work as in 018:
-- owner-only inserts (RLS), only the approving owner may decide, the requester can't approve, decide once.
drop trigger if exists skill_requests_block_experimental on public.skill_requests;
drop function if exists public.skill_requests_block_experimental();

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
