-- Enable Row Level Security
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetup_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Owners policies: users can only see/edit their own owner record
CREATE POLICY "Users can view own owner record"
  ON owners FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY "Users can update own owner record"
  ON owners FOR UPDATE
  USING (auth_id = auth.uid());

CREATE POLICY "Users can insert own owner record"
  ON owners FOR INSERT
  WITH CHECK (auth_id = auth.uid());

-- Bots policies: owners can only manage their own bots
CREATE POLICY "Owners can view own bots"
  ON bots FOR SELECT
  USING (owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

CREATE POLICY "Owners can create own bots"
  ON bots FOR INSERT
  WITH CHECK (owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

CREATE POLICY "Owners can update own bots"
  ON bots FOR UPDATE
  USING (owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

CREATE POLICY "Owners can delete own bots"
  ON bots FOR DELETE
  USING (owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

-- Meetups policies: owners can see meetups they created or were invited to
CREATE POLICY "Owners can view own meetups"
  ON meetups FOR SELECT
  USING (
    created_by IN (SELECT id FROM owners WHERE auth_id = auth.uid())
    OR id IN (
      SELECT meetup_id FROM invites 
      WHERE invitee_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
        AND status = 'accepted'
    )
  );

CREATE POLICY "Owners can create meetups"
  ON meetups FOR INSERT
  WITH CHECK (created_by IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

CREATE POLICY "Owners can update own meetups"
  ON meetups FOR UPDATE
  USING (created_by IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

-- Invites policies
CREATE POLICY "Owners can view invites they sent or received"
  ON invites FOR SELECT
  USING (
    inviter_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
    OR invitee_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
    OR invitee_email IN (SELECT email FROM owners WHERE auth_id = auth.uid())
  );

CREATE POLICY "Owners can create invites for own meetups"
  ON invites FOR INSERT
  WITH CHECK (
    inviter_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
    AND meetup_id IN (SELECT id FROM meetups WHERE created_by IN (SELECT id FROM owners WHERE auth_id = auth.uid()))
  );

CREATE POLICY "Owners can update invites they received"
  ON invites FOR UPDATE
  USING (
    invitee_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
    OR inviter_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
  );

-- Meetup participants policies
CREATE POLICY "Owners can view participants in their meetups"
  ON meetup_participants FOR SELECT
  USING (
    meetup_id IN (
      SELECT id FROM meetups 
      WHERE created_by IN (SELECT id FROM owners WHERE auth_id = auth.uid())
        OR id IN (
          SELECT meetup_id FROM invites 
          WHERE invitee_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
            AND status = 'accepted'
        )
    )
  );

CREATE POLICY "Owners can add their bots to approved meetups"
  ON meetup_participants FOR INSERT
  WITH CHECK (
    bot_id IN (SELECT id FROM bots WHERE owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()))
    AND meetup_id IN (
      SELECT meetup_id FROM invites 
      WHERE invitee_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
        AND status = 'accepted'
    )
  );

CREATE POLICY "Owners can update their bot participants"
  ON meetup_participants FOR UPDATE
  USING (
    bot_id IN (SELECT id FROM bots WHERE owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()))
  );

-- Messages policies: owners can read messages from meetups they're part of
CREATE POLICY "Owners can view messages in their meetups"
  ON messages FOR SELECT
  USING (
    meetup_id IN (
      SELECT id FROM meetups 
      WHERE created_by IN (SELECT id FROM owners WHERE auth_id = auth.uid())
        OR id IN (
          SELECT meetup_id FROM invites 
          WHERE invitee_id IN (SELECT id FROM owners WHERE auth_id = auth.uid())
            AND status = 'accepted'
        )
    )
  );

-- Note: Message INSERT is handled by Edge Functions with bot key auth, not RLS

-- Pending learnings policies
CREATE POLICY "Owners can view own pending learnings"
  ON pending_learnings FOR SELECT
  USING (owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

CREATE POLICY "Owners can update own pending learnings"
  ON pending_learnings FOR UPDATE
  USING (owner_id IN (SELECT id FROM owners WHERE auth_id = auth.uid()));

-- Rate limits policies: only for internal use
CREATE POLICY "Rate limits are system managed"
  ON rate_limits FOR SELECT
  USING (false);
