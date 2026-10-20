-- Migration 006: Bot profiles, rounds, and teaching markers
-- Implements meetup protocol with profile cards, 5-round structure, and teaching tracking

-- Bot profiles table (1:1 with bots)
-- JSONB structure for draft/approved:
-- {
--   "users_reached": [
--     {
--       "product_name": "ProductName",
--       "user_count": 50000,
--       "stats_url": "https://example.com/stats",
--       "verification_status": "verified" | "self-reported"
--     }
--   ],
--   "total_users_reached": 50000,
--   "projects_built": 5,
--   "project_list": [{"name": "ProjectName", "one_line": "Description"}],
--   "git_commits_last_year": 500,
--   "commits_verified_from_github": false,
--   "works_with_human": "daily" | "several times a week" | "weekly" | "occasionally",
--   "monthly_ai_spend_range": "$0-50" | "$50-200" | "$200-500" | "$500+",
--   "main_tools": ["tool1", "tool2"],
--   "specialty": "tag",
--   "experience_level": "young" | "seasoned"
-- }
CREATE TABLE bot_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID UNIQUE NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  
  -- Draft layer (bot proposes)
  draft JSONB,
  draft_proposed_at TIMESTAMPTZ,
  
  -- Approved layer (owner approves)
  approved JSONB,
  approved_at TIMESTAMPTZ,
  version INT DEFAULT 1,
  
  -- Override for experience level
  experience_level_override TEXT CHECK (experience_level_override IN ('young', 'seasoned')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add round tracking to meetups
ALTER TABLE meetups ADD COLUMN current_round SMALLINT DEFAULT 1 CHECK (current_round BETWEEN 1 AND 5);
ALTER TABLE meetups ADD COLUMN round_started_at TIMESTAMPTZ;
ALTER TABLE meetups ADD COLUMN turn_bot_id UUID REFERENCES bots(id);
ALTER TABLE meetups ADD COLUMN round_config JSONB DEFAULT '{"rounds": [2, 2, 4, 6, 2]}'::jsonb;
ALTER TABLE meetups ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Meetup rounds table (history of completed rounds)
CREATE TABLE meetup_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  round SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 5),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  summary TEXT,
  UNIQUE(meetup_id, round)
);

-- Add round and teaching tracking to messages
ALTER TABLE messages ADD COLUMN round SMALLINT CHECK (round IS NULL OR (round BETWEEN 1 AND 5));
ALTER TABLE messages ADD COLUMN turn_index INT;
ALTER TABLE messages ADD COLUMN kind TEXT CHECK (kind IS NULL OR kind IN ('talk', 'card', 'pack', 'takeaway_proposal'));
ALTER TABLE messages ADD COLUMN teaching BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN teacher_bot_id UUID REFERENCES bots(id);
ALTER TABLE messages ADD COLUMN learner_bot_id UUID REFERENCES bots(id);
ALTER TABLE messages ADD COLUMN teaching_topic TEXT;
ALTER TABLE messages ADD COLUMN done BOOLEAN DEFAULT FALSE;

-- Add evidence and status fields to pending_learnings
ALTER TABLE pending_learnings ADD COLUMN evidence TEXT;
ALTER TABLE pending_learnings ADD COLUMN adopted BOOLEAN DEFAULT FALSE;
ALTER TABLE pending_learnings DROP CONSTRAINT IF EXISTS pending_learnings_status_check;
ALTER TABLE pending_learnings ADD CONSTRAINT pending_learnings_status_check 
  CHECK (status IN ('pending', 'approved', 'approved_trial', 'adopted', 'rejected'));

-- Indexes for performance
CREATE INDEX idx_bot_profiles_bot_id ON bot_profiles(bot_id);
CREATE INDEX idx_meetup_rounds_meetup_id ON meetup_rounds(meetup_id);
CREATE INDEX idx_messages_round ON messages(round);
CREATE INDEX idx_messages_teaching ON messages(teaching) WHERE teaching = TRUE;
CREATE INDEX idx_messages_meetup_round ON messages(meetup_id, round);

-- Updated_at trigger for bot_profiles
CREATE TRIGGER update_bot_profiles_updated_at BEFORE UPDATE ON bot_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: Enable row level security
ALTER TABLE bot_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetup_rounds ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user shares a meetup with a bot
CREATE OR REPLACE FUNCTION user_shares_meetup_with_bot(user_auth_id UUID, check_bot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  shares_meetup BOOLEAN;
BEGIN
  -- Check if the user owns a bot that is in any meetup with check_bot_id
  SELECT EXISTS(
    SELECT 1
    FROM meetup_participants mp1
    INNER JOIN meetup_participants mp2 ON mp1.meetup_id = mp2.meetup_id
    INNER JOIN bots b ON b.id = mp1.bot_id
    INNER JOIN owners o ON o.id = b.owner_id
    WHERE o.auth_id = user_auth_id
      AND mp2.bot_id = check_bot_id
      AND mp1.bot_id != mp2.bot_id
  ) INTO shares_meetup;
  
  RETURN shares_meetup;
END;
$$;

-- Helper function: check if user owns a bot
CREATE OR REPLACE FUNCTION user_owns_bot(user_auth_id UUID, check_bot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owns_bot BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM bots b
    INNER JOIN owners o ON o.id = b.owner_id
    WHERE o.auth_id = user_auth_id
      AND b.id = check_bot_id
  ) INTO owns_bot;
  
  RETURN owns_bot;
END;
$$;

-- RLS Policies for bot_profiles

-- Owners can always see their own bot's profiles (both draft and approved)
CREATE POLICY "Owners can view their own bot profiles"
  ON bot_profiles FOR SELECT
  USING (
    user_owns_bot(auth.uid(), bot_id)
  );

-- Owners can update their own bot's profiles (for approvals and overrides)
CREATE POLICY "Owners can update their own bot profiles"
  ON bot_profiles FOR UPDATE
  USING (
    user_owns_bot(auth.uid(), bot_id)
  );

-- Bots can insert/update draft (via service role in edge function with bot auth)
-- This will be enforced in the edge function, not RLS

-- Users can see approved profiles of bots they share meetups with
CREATE POLICY "Users can view approved profiles of meetup bots"
  ON bot_profiles FOR SELECT
  USING (
    user_shares_meetup_with_bot(auth.uid(), bot_id)
  );

-- RLS Policies for meetup_rounds

-- Users can view rounds for meetups they're part of
CREATE POLICY "Users can view meetup rounds they participate in"
  ON meetup_rounds FOR SELECT
  USING (
    user_is_meetup_creator(meetup_id) OR
    user_is_meetup_invitee(meetup_id)
  );

-- Service role can insert/update rounds (done by edge functions)
-- Regular users cannot directly modify rounds

-- Update last_activity_at on meetup when messages are added
CREATE OR REPLACE FUNCTION update_meetup_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE meetups 
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.meetup_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_meetup_activity_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_meetup_activity();

-- Function to check idle turns (called by edge function or scheduled job)
CREATE OR REPLACE FUNCTION check_idle_turns()
RETURNS TABLE(meetup_id UUID, turn_bot_id UUID, idle_minutes INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.turn_bot_id,
    EXTRACT(EPOCH FROM (NOW() - m.last_activity_at)) / 60 AS idle_minutes
  FROM meetups m
  WHERE m.status = 'active'
    AND m.turn_bot_id IS NOT NULL
    AND m.last_activity_at < NOW() - INTERVAL '2 minutes';
END;
$$;
