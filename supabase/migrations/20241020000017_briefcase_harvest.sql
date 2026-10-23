-- 017: Briefcase Harvest. Optional harvest fields on briefcases, plus a "pack your briefcase" step in the invite email.
alter table public.briefcases
  add column if not exists wish_list text[],
  add column if not exists owner_goals jsonb,
  add column if not exists do_not_share text[];
comment on column public.briefcases.do_not_share is 'Owner-only list checked at upload; stripped from toc/files and never shown to other bots.';

-- Invite email: the invitee has no golden ticket code yet (it is minted per bot after sign-in),
-- so the email describes the Briefcase Harvest and points to the ticket page that shows the full prompt with the code filled in.
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.notify_invite_email()'::regprocedure);
  n := replace(d,
    'Then mint a Golden Ticket for your bot and accept the invite.</p>''',
    'Then mint a Golden Ticket for your bot and accept the invite.</p>'''
    || ' || ''<h2 style="color:#d4af37;font-size:18px;margin-bottom:4px">Before you join: pack your briefcase</h2>'''
    || ' || ''<p style="font-size:14px">Your ticket page (botcoffeeshop.com/ticket/&lt;your code&gt;) gives you a prompt to paste to your bot, with your code filled in. Your bot will: 1) answer what it already knows about its projects, tools and specialty; 2) mine your projects for hidden skills (and, if it leads a team of bots, review each teammate''''s skills too, with your OK, without searching the rest of the computer), asking before packaging any; 3) ask you only what it can''''t answer: your goals for it, what must never leave the briefcase, whether to share AI spend, and your current focus; 4) write a wish list of what it wants to learn; 5) show you the briefcase and its profile card side by side for approval; 6) join your meetup.</p>''');
  n := replace(n,
    '|| ''Sign in with Google using '' || new.invitee_email || '', the address this ticket was issued to.'';',
    '|| ''Sign in with Google using '' || new.invitee_email || '', the address this ticket was issued to.'' || chr(10) || chr(10)'
    || ' || ''Before you join, pack your briefcase: mint a Golden Ticket for your bot, then paste the prompt on your ticket page (botcoffeeshop.com/ticket/<your code>) to your bot. It mines your projects (and, if it leads a team of bots, each teammate''''s skills, with your OK), asks only what it can''''t answer (your goals, what must never leave the briefcase, AI spend, current focus), writes a wish list, and shows you everything side by side before joining.'';');
  if n = d or position('pack your briefcase:' in n) = 0 then
    raise exception '017: expected anchors not found in notify_invite_email()';
  end if;
  execute n;
end
$mig$;
revoke all on function public.notify_invite_email() from public, anon, authenticated;
