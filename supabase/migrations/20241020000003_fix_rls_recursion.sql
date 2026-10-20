-- Fix RLS recursion between meetups and invites policies
-- and set search_path on helper functions

-- Helper function: Check if user is owner of a meetup
-- SECURITY DEFINER bypasses RLS to prevent recursion
CREATE OR REPLACE FUNCTION public.user_is_meetup_creator(meetup_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_owner_id UUID;
  meetup_creator_id UUID;
BEGIN
  -- Get current user's owner ID
  SELECT id INTO user_owner_id
  FROM public.owners
  WHERE auth_id = auth.uid()
  LIMIT 1;

  IF user_owner_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get meetup creator ID (bypasses RLS due to SECURITY DEFINER)
  SELECT created_by INTO meetup_creator_id
  FROM public.meetups
  WHERE id = meetup_uuid
  LIMIT 1;

  RETURN meetup_creator_id = user_owner_id;
END;
$$;

-- Helper function: Check if user is an accepted invitee for a meetup
-- SECURITY DEFINER bypasses RLS to prevent recursion
CREATE OR REPLACE FUNCTION public.user_is_meetup_invitee(meetup_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_owner_id UUID;
  invite_count INTEGER;
BEGIN
  -- Get current user's owner ID
  SELECT id INTO user_owner_id
  FROM public.owners
  WHERE auth_id = auth.uid()
  LIMIT 1;

  IF user_owner_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has accepted invite (bypasses RLS due to SECURITY DEFINER)
  SELECT COUNT(*) INTO invite_count
  FROM public.invites
  WHERE meetup_id = meetup_uuid
    AND invitee_id = user_owner_id
    AND status = 'accepted'
  LIMIT 1;

  RETURN invite_count > 0;
END;
$$;

-- Helper function: Check if user owns a specific owner_id
-- Used by invites INSERT policy to verify meetup ownership
CREATE OR REPLACE FUNCTION public.user_owns_owner_id(check_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_owner_id UUID;
BEGIN
  SELECT id INTO user_owner_id
  FROM public.owners
  WHERE auth_id = auth.uid()
  LIMIT 1;

  RETURN user_owner_id = check_owner_id;
END;
$$;

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Owners can view own meetups" ON meetups;
DROP POLICY IF EXISTS "Owners can create invites for own meetups" ON invites;

-- Recreate meetups SELECT policy using helper function (prevents recursion)
CREATE POLICY "Owners can view own meetups"
  ON meetups FOR SELECT
  USING (
    public.user_is_meetup_creator(id)
    OR public.user_is_meetup_invitee(id)
  );

-- Recreate invites INSERT policy using helper function (prevents recursion)
CREATE POLICY "Owners can create invites for own meetups"
  ON invites FOR INSERT
  WITH CHECK (
    public.user_owns_owner_id(inviter_id)
    AND public.user_is_meetup_creator(meetup_id)
  );

-- Fix search_path on update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Grant execute permissions on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION public.user_is_meetup_creator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_meetup_invitee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_owner_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.user_is_meetup_creator IS 
  'SECURITY DEFINER function to check meetup ownership without RLS recursion';
COMMENT ON FUNCTION public.user_is_meetup_invitee IS 
  'SECURITY DEFINER function to check accepted invite status without RLS recursion';
COMMENT ON FUNCTION public.user_owns_owner_id IS 
  'SECURITY DEFINER function to verify owner ID ownership';
