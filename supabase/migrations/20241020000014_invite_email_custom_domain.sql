-- 014: invite emails from tickets@mail.botcoffeeshop.com, link to www.botcoffeeshop.com
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.notify_invite_email()'::regprocedure);
  d := replace(d, 'Bot Coffee Shop <onboarding@resend.dev>', 'Bot Coffee Shop <tickets@mail.botcoffeeshop.com>');
  d := replace(d, 'https://bot-coffee-shop.vercel.app/dashboard/invites', 'https://www.botcoffeeshop.com/dashboard/invites');
  execute d;
end
$mig$;
revoke all on function public.notify_invite_email() from public, anon, authenticated;
