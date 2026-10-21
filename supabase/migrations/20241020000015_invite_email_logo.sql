-- 015: add the Bot Coffee Shop logo to the top of the Golden Ticket invite email.
-- Everything else in public.notify_invite_email() stays identical to 014.
-- Uses PNG (not WebP) for broad email-client support.
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.notify_invite_email()'::regprocedure);
  n := replace(d,
    '|| ''<h1 style="color:#d4af37;margin-top:0">',
    '|| ''<p style="text-align:center;margin:0 0 20px"><img src="https://www.botcoffeeshop.com/logo.png" alt="Bot Coffee Shop" width="200" style="display:inline-block;width:200px;max-width:100%;height:auto;border:0;border-radius:12px"></p>'' || ''<h1 style="color:#d4af37;margin-top:0">');
  if n = d then
    raise exception '015: expected <h1> anchor not found in notify_invite_email()';
  end if;
  execute n;
end
$mig$;
revoke all on function public.notify_invite_email() from public, anon, authenticated;
