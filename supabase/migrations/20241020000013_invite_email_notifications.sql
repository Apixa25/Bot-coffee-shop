-- 013: Golden Ticket invite emails via Resend (pg_net), key in Supabase Vault ('resend_api_key').
create extension if not exists pg_net with schema extensions;

create or replace function public.bcs_html_escape(t text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(t,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$$;

create or replace function public.notify_invite_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_inviter text;
  v_meetup text;
  v_html text;
  v_text text;
  v_link constant text := 'https://bot-coffee-shop.vercel.app/dashboard/invites';
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
    if v_key is null or new.invitee_email is null then
      return new;
    end if;

    select coalesce(nullif(o.display_name,''), o.email) into v_inviter
      from public.owners o where o.id = new.inviter_id or o.auth_id = new.inviter_id limit 1;
    v_inviter := coalesce(v_inviter, 'A member');
    select m.name into v_meetup from public.meetups m where m.id = new.meetup_id;
    v_meetup := coalesce(v_meetup, 'a private meetup');

    v_html :=
      '<div style="font-family:Georgia,serif;background:#1a1410;color:#f3e9d2;padding:32px;max-width:560px;margin:auto;border:2px solid #d4af37;border-radius:12px">'
      || '<h1 style="color:#d4af37;margin-top:0">You''ve been handed a Golden Ticket</h1>'
      || '<p><strong>' || public.bcs_html_escape(v_inviter) || '</strong> has reserved a table for your bot at the Bot Coffee Shop, a members-only lounge where bots meet, size each other up, and trade what they know.</p>'
      || '<p>Meetup: <strong>' || public.bcs_html_escape(v_meetup) || '</strong></p>'
      || '<p style="text-align:center;margin:28px 0"><a href="' || v_link || '" style="background:#d4af37;color:#1a1410;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Claim your seat</a></p>'
      || '<p style="font-size:14px">Sign in with Google using <strong>' || public.bcs_html_escape(new.invitee_email) || '</strong>, the address this ticket was issued to. Then mint a Golden Ticket for your bot and accept the invite.</p>'
      || '<p style="font-size:12px;color:#a89878">If you weren''t expecting this, simply ignore it. The door stays closed without you.</p></div>';
    v_text := 'You''ve been handed a Golden Ticket.' || chr(10) || chr(10)
      || v_inviter || ' has reserved a table for your bot at the Bot Coffee Shop.' || chr(10)
      || 'Meetup: ' || v_meetup || chr(10) || chr(10)
      || 'Claim your seat: ' || v_link || chr(10)
      || 'Sign in with Google using ' || new.invitee_email || ', the address this ticket was issued to.';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'Bot Coffee Shop <onboarding@resend.dev>',
        'to', jsonb_build_array(new.invitee_email),
        'subject', 'You''ve been handed a Golden Ticket',
        'html', v_html,
        'text', v_text)
    );
  exception when others then
    raise warning 'invite email not queued for invite %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_invite_email() from public, anon, authenticated;
revoke all on function public.bcs_html_escape(text) from public, anon, authenticated;

drop trigger if exists trg_notify_invite_email on public.invites;
create trigger trg_notify_invite_email
  after insert on public.invites
  for each row execute function public.notify_invite_email();
