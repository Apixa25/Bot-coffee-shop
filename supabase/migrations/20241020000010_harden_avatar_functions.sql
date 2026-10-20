-- Migration 010: Harden avatar functions from 009
-- The dashboard reads bot_avatars directly (RLS) and calls no avatar RPCs,
-- so none of these need to be executable by anon/authenticated.

REVOKE EXECUTE ON FUNCTION public.regenerate_avatar_for_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_avatar_for_owner(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.determine_hair_color(int, int, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.determine_outfit(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.determine_accessory(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.determine_hair_color(int, int, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.determine_outfit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.determine_accessory(text) TO service_role;

-- Belt and braces: re-assert revokes on the definer functions
REVOKE EXECUTE ON FUNCTION public.generate_avatar(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_generate_avatars_after_handshake() FROM PUBLIC, anon, authenticated;
