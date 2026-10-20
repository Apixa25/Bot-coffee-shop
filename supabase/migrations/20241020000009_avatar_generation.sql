-- Migration 008: Avatar generation and mapping rules
-- Generates assessment avatars from approved profile cards after Handshake

-- Bot avatars table
CREATE TABLE bot_avatars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  meetup_id UUID REFERENCES meetups(id) ON DELETE CASCADE,
  
  -- Avatar components (derived from approved card)
  hair TEXT NOT NULL CHECK (hair IN ('brown', 'gray')),
  outfit TEXT NOT NULL CHECK (outfit IN ('tattered', 'casual', 'smart', 'suit')),
  accessory TEXT NOT NULL,
  
  -- Metadata
  rules_version INT DEFAULT 1,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(bot_id, meetup_id)
);

CREATE INDEX idx_bot_avatars_bot_id ON bot_avatars(bot_id);
CREATE INDEX idx_bot_avatars_meetup_id ON bot_avatars(meetup_id);

-- Function to determine hair color based on experience
-- Gray if: 10+ projects shipped OR 1,000+ commits last year
-- Otherwise: brown
CREATE OR REPLACE FUNCTION determine_hair_color(
  projects_built INT,
  commits_last_year INT,
  bot_created_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Seasoned criteria: 10+ projects OR 1,000+ commits
  IF (projects_built >= 10 OR commits_last_year >= 1000) THEN
    RETURN 'gray';
  END IF;
  
  RETURN 'brown';
END;
$$;

-- Function to determine outfit based on spend range
CREATE OR REPLACE FUNCTION determine_outfit(spend_range TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE spend_range
    WHEN '$0-50' THEN RETURN 'tattered';
    WHEN '$50-200' THEN RETURN 'casual';
    WHEN '$200-500' THEN RETURN 'smart';
    WHEN '$500+' THEN RETURN 'suit';
    ELSE RETURN 'casual'; -- fallback
  END CASE;
END;
$$;

-- Function to determine accessory based on specialty
CREATE OR REPLACE FUNCTION determine_accessory(specialty TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Map specialty tags to accessories
  CASE LOWER(COALESCE(specialty, ''))
    WHEN 'memory' THEN RETURN 'library-card';
    WHEN 'coding', 'code', 'programming' THEN RETURN 'laptop';
    WHEN 'writing', 'content' THEN RETURN 'quill';
    WHEN 'marketing', 'growth' THEN RETURN 'megaphone';
    WHEN 'research', 'analysis' THEN RETURN 'magnifier';
    WHEN 'ops', 'devops', 'operations' THEN RETURN 'wrench';
    WHEN 'social', 'community' THEN RETURN 'phone';
    WHEN 'design', 'ui', 'ux' THEN RETURN 'palette';
    WHEN 'data', 'analytics' THEN RETURN 'chart';
    ELSE RETURN 'coffee-mug'; -- default for unknown
  END CASE;
END;
$$;

-- Main avatar generation function
-- Generates avatar from bot's approved profile card
CREATE OR REPLACE FUNCTION generate_avatar(
  p_bot_id UUID,
  p_meetup_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  avatar_id UUID,
  hair TEXT,
  outfit TEXT,
  accessory TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile RECORD;
  v_bot RECORD;
  v_hair TEXT;
  v_outfit TEXT;
  v_accessory TEXT;
  v_avatar_id UUID;
BEGIN
  -- Get bot
  SELECT * INTO v_bot
  FROM bots
  WHERE id = p_bot_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Bot not found', NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Get approved profile
  SELECT * INTO v_profile
  FROM bot_profiles
  WHERE bot_id = p_bot_id;
  
  IF NOT FOUND OR v_profile.approved IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No approved profile found', NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Apply mapping rules
  v_hair := determine_hair_color(
    COALESCE((v_profile.approved->>'projects_built')::INT, 0),
    COALESCE((v_profile.approved->>'git_commits_last_year')::INT, 0),
    v_bot.created_at
  );
  
  v_outfit := determine_outfit(
    COALESCE(v_profile.approved->>'monthly_ai_spend_range', '$0-50')
  );
  
  v_accessory := determine_accessory(
    v_profile.approved->>'specialty'
  );
  
  -- Insert or update avatar
  INSERT INTO bot_avatars (bot_id, meetup_id, hair, outfit, accessory, rules_version)
  VALUES (p_bot_id, p_meetup_id, v_hair, v_outfit, v_accessory, 1)
  ON CONFLICT (bot_id, meetup_id)
  DO UPDATE SET
    hair = EXCLUDED.hair,
    outfit = EXCLUDED.outfit,
    accessory = EXCLUDED.accessory,
    generated_at = NOW()
  RETURNING id INTO v_avatar_id;
  
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_avatar_id, v_hair, v_outfit, v_accessory;
END;
$$;

-- Function to auto-generate avatars when round 1 (Handshake) closes
CREATE OR REPLACE FUNCTION auto_generate_avatars_after_handshake()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_participant RECORD;
BEGIN
  -- Only trigger when round 1 is closed
  IF NEW.round = 1 AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    -- Generate avatars for all participants in this meetup
    FOR v_participant IN
      SELECT bot_id FROM meetup_participants
      WHERE meetup_id = NEW.meetup_id
        AND owner_approved = TRUE
    LOOP
      PERFORM generate_avatar(v_participant.bot_id, NEW.meetup_id);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger on meetup_rounds to generate avatars after Handshake
CREATE TRIGGER generate_avatars_after_round1
  AFTER UPDATE ON meetup_rounds
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_avatars_after_handshake();

-- RLS for bot_avatars
ALTER TABLE bot_avatars ENABLE ROW LEVEL SECURITY;

-- Users can view avatars for bots in meetups they participate in
CREATE POLICY "Users can view avatars in their meetups"
  ON bot_avatars FOR SELECT
  USING (
    user_is_meetup_creator(meetup_id) OR
    user_is_meetup_invitee(meetup_id)
  );

-- Function to regenerate avatar (owner can request this)
CREATE OR REPLACE FUNCTION regenerate_avatar_for_owner(
  p_bot_id UUID,
  p_meetup_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Check if user owns the bot
  IF NOT user_owns_bot(auth.uid(), p_bot_id) THEN
    RETURN QUERY SELECT FALSE, 'You do not own this bot';
    RETURN;
  END IF;
  
  -- Generate avatar
  SELECT * INTO v_result
  FROM generate_avatar(p_bot_id, p_meetup_id);
  
  RETURN QUERY SELECT v_result.success, v_result.error_message;
END;
$$;

-- Harden SECURITY DEFINER functions: only service_role and authenticated may call them
ALTER FUNCTION public.determine_hair_color(int, int, timestamptz) SET search_path = public, pg_temp;
ALTER FUNCTION public.determine_outfit(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.determine_accessory(text) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.generate_avatar(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_generate_avatars_after_handshake() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_avatar(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.determine_hair_color(int, int, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.determine_outfit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.determine_accessory(text) TO authenticated, service_role;
