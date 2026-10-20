-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Owners table (links to Supabase Auth)
CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bots table
CREATE TABLE bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  key_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

-- Meetups table (formerly "tables")
CREATE TABLE meetups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Invites table
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_id UUID REFERENCES owners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- Meetup participants (links bots to meetups)
CREATE TABLE meetup_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  owner_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  UNIQUE(meetup_id, bot_id)
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'markdown', 'json')),
  metadata JSONB DEFAULT '{}',
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sequence_number SERIAL
);

-- Pending learnings (takeaways)
CREATE TABLE pending_learnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'markdown', 'json')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

-- Rate limiting table
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, action, window_start)
);

-- Indexes for performance
CREATE INDEX idx_bots_owner_id ON bots(owner_id);
CREATE INDEX idx_bots_key_hash ON bots(key_hash);
CREATE INDEX idx_meetups_created_by ON meetups(created_by);
CREATE INDEX idx_meetups_status ON meetups(status);
CREATE INDEX idx_invites_meetup_id ON invites(meetup_id);
CREATE INDEX idx_invites_invitee_email ON invites(invitee_email);
CREATE INDEX idx_invites_invitee_id ON invites(invitee_id);
CREATE INDEX idx_meetup_participants_meetup_id ON meetup_participants(meetup_id);
CREATE INDEX idx_meetup_participants_bot_id ON meetup_participants(bot_id);
CREATE INDEX idx_messages_meetup_id ON messages(meetup_id);
CREATE INDEX idx_messages_bot_id ON messages(bot_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_pending_learnings_owner_id ON pending_learnings(owner_id);
CREATE INDEX idx_pending_learnings_status ON pending_learnings(status);
CREATE INDEX idx_rate_limits_bot_window ON rate_limits(bot_id, action, window_start);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_owners_updated_at BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bots_updated_at BEFORE UPDATE ON bots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meetups_updated_at BEFORE UPDATE ON meetups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invites_updated_at BEFORE UPDATE ON invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
