-- 012: fix meetup creation RLS + invitee accept flow
-- Root cause: the meetups SELECT policy relied only on SECURITY DEFINER helper
-- user_is_meetup_creator(id), which re-queries meetups and cannot see the row
-- being inserted in the same statement. INSERT ... RETURNING (supabase .select())
-- therefore failed the SELECT check -> "new row violates row-level security policy".

-- 1) meetups SELECT: check creator directly on the row; invitees (pending or accepted,
--    matched by owner id or email) can see the meetup so the invites page can show its name.
drop policy if exists "Owners can view own meetups" on public.meetups;
create policy "Owners can view own meetups" on public.meetups
  for select to authenticated
  using (
    created_by in (select o.id from public.owners o where o.auth_id = auth.uid())
    or exists (
      select 1 from public.invites i
      where i.meetup_id = meetups.id
        and (
          i.invitee_id in (select o.id from public.owners o where o.auth_id = auth.uid())
          or i.invitee_email in (select o.email from public.owners o where o.auth_id = auth.uid())
        )
    )
  );

-- 2) invites UPDATE: invitee matched by email (invitee_id still null) can respond,
--    but may only set invitee_id to themselves.
drop policy if exists "Owners can update invites they received" on public.invites;
create policy "Owners can update invites they received" on public.invites
  for update to authenticated
  using (
    invitee_id in (select o.id from public.owners o where o.auth_id = auth.uid())
    or invitee_email in (select o.email from public.owners o where o.auth_id = auth.uid())
    or inviter_id in (select o.id from public.owners o where o.auth_id = auth.uid())
  )
  with check (
    invitee_id in (select o.id from public.owners o where o.auth_id = auth.uid())
    or inviter_id in (select o.id from public.owners o where o.auth_id = auth.uid())
  );

-- 3) Activate meetup server-side when every invite is accepted (invitee cannot update meetups).
create or replace function public.activate_meetup_when_all_accepted()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'accepted' and not exists (
    select 1 from public.invites where meetup_id = new.meetup_id and status <> 'accepted'
  ) then
    update public.meetups
       set status = 'active', started_at = coalesce(started_at, now())
     where id = new.meetup_id and status = 'pending';
  end if;
  return new;
end $$;
revoke all on function public.activate_meetup_when_all_accepted() from public, anon, authenticated;

drop trigger if exists trg_activate_meetup_on_accept on public.invites;
create trigger trg_activate_meetup_on_accept
  after update of status on public.invites
  for each row execute function public.activate_meetup_when_all_accepted();
