-- Hardening follow-up to 003/004
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.owners (auth_id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''),
          COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'))
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_is_meetup_creator(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_is_meetup_invitee(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_owner_id(UUID) FROM PUBLIC, anon;

INSERT INTO public.owners (auth_id, email)
SELECT u.id, COALESCE(u.email, '') FROM auth.users u
ON CONFLICT (auth_id) DO NOTHING;
