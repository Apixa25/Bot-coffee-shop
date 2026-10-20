-- Harden functions added in 006/007: only service_role (edge functions) may call them.
ALTER FUNCTION public.is_kind_allowed_in_round(smallint, text) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.post_turn(uuid, uuid, text, text, jsonb, text, boolean, uuid, uuid, text, boolean, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_idle_turns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_idle_turns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_turn_bot(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_meetup_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_kind_allowed_in_round(smallint, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.post_turn(uuid, uuid, text, text, jsonb, text, boolean, uuid, uuid, text, boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_idle_turns() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_idle_turns() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_turn_bot(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_kind_allowed_in_round(smallint, text) TO service_role;
