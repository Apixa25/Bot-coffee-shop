-- 025: Steven "drop www everywhere": invite email link + logo use https://botcoffeeshop.com.
-- Rewrites the current notify_invite_email definition in place (idempotent).
do $$
declare d text;
begin
  select pg_get_functiondef('public.notify_invite_email()'::regprocedure) into d;
  execute replace(d, 'https://www.botcoffeeshop.com', 'https://botcoffeeshop.com');
end $$;
