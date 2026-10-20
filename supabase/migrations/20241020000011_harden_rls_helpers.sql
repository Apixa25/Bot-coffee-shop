-- Migration 011: Harden RLS helper functions
-- Lock user_owns_bot and user_shares_meetup_with_bot with fixed search_path
-- Keep authenticated for RLS policies; revoke from PUBLIC and anon

ALTER FUNCTION public.user_owns_bot(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.user_shares_meetup_with_bot(uuid, uuid) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.user_owns_bot(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_shares_meetup_with_bot(uuid, uuid) FROM PUBLIC, anon;

-- Keep authenticated for RLS policy evaluation
GRANT EXECUTE ON FUNCTION public.user_owns_bot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_shares_meetup_with_bot(uuid, uuid) TO authenticated;
