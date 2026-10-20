-- Migration 007: Turn enforcement and round advancement
-- Implements server-side turn control, round transitions, and idle turn handling

-- Function to check if a message kind is allowed in a round
CREATE OR REPLACE FUNCTION is_kind_allowed_in_round(round_num SMALLINT, msg_kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Round 1 (Handshake): only card
  IF round_num = 1 THEN
    RETURN msg_kind = 'card';
  END IF;
  
  -- Round 2 (Sizing up): talk only
  IF round_num = 2 THEN
    RETURN msg_kind = 'talk' OR msg_kind IS NULL;
  END IF;
  
  -- Round 3 (Specialty): talk and pack
  IF round_num = 3 THEN
    RETURN msg_kind IN ('talk', 'pack') OR msg_kind IS NULL;
  END IF;
  
  -- Round 4 (Exchange): talk and pack
  IF round_num = 4 THEN
    RETURN msg_kind IN ('talk', 'pack') OR msg_kind IS NULL;
  END IF;
  
  -- Round 5 (Takeaways): only takeaway_proposal via propose-learning and short talk
  IF round_num = 5 THEN
    RETURN msg_kind = 'talk' OR msg_kind IS NULL;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Function to get the next bot in turn order
CREATE OR REPLACE FUNCTION get_next_turn_bot(meetup_uuid UUID, current_bot_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_bot UUID;
BEGIN
  -- Get the next bot in the meetup (round-robin)
  SELECT bot_id INTO next_bot
  FROM meetup_participants
  WHERE meetup_id = meetup_uuid
    AND bot_id != current_bot_uuid
    AND owner_approved = TRUE
  ORDER BY joined_at
  LIMIT 1;
  
  RETURN next_bot;
END;
$$;

-- Main turn enforcement function
-- Returns: success with message_id, or error with 409 and reason
CREATE OR REPLACE FUNCTION post_turn(
  p_meetup_id UUID,
  p_bot_id UUID,
  p_content TEXT,
  p_content_type TEXT,
  p_metadata JSONB,
  p_kind TEXT,
  p_teaching BOOLEAN,
  p_teacher_bot_id UUID,
  p_learner_bot_id UUID,
  p_teaching_topic TEXT,
  p_done BOOLEAN,
  p_flagged BOOLEAN,
  p_flag_reason TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message_id UUID,
  error_code TEXT,
  error_message TEXT,
  current_round SMALLINT,
  current_turn_bot_id UUID,
  round_advanced BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meetup RECORD;
  v_participant RECORD;
  v_turn_count INT;
  v_max_turns INT;
  v_new_message_id UUID;
  v_other_bot_id UUID;
  v_both_done BOOLEAN;
  v_round_complete BOOLEAN;
  v_next_round SMALLINT;
BEGIN
  -- Lock the meetup row to prevent concurrent turn conflicts
  SELECT * INTO v_meetup
  FROM meetups
  WHERE id = p_meetup_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'MEETUP_NOT_FOUND', 'Meetup not found', NULL::SMALLINT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Check meetup is active
  IF v_meetup.status != 'active' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'MEETUP_NOT_ACTIVE', 'Meetup is not active', v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Check participant is approved
  SELECT * INTO v_participant
  FROM meetup_participants
  WHERE meetup_id = p_meetup_id AND bot_id = p_bot_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'BOT_NOT_IN_MEETUP', 'Bot not in meetup', v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  IF NOT v_participant.owner_approved THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'BOT_NOT_APPROVED', 'Owner has not approved bot for this meetup', v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Check all participants are approved
  IF EXISTS(
    SELECT 1 FROM meetup_participants
    WHERE meetup_id = p_meetup_id AND owner_approved = FALSE
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'NOT_ALL_APPROVED', 'Not all participants have been approved', v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Initialize turn if needed (first message)
  IF v_meetup.turn_bot_id IS NULL THEN
    UPDATE meetups
    SET turn_bot_id = p_bot_id,
        round_started_at = NOW(),
        last_activity_at = NOW()
    WHERE id = p_meetup_id;
    
    v_meetup.turn_bot_id := p_bot_id;
    v_meetup.round_started_at := NOW();
  END IF;
  
  -- Check if it's this bot's turn
  IF v_meetup.turn_bot_id != p_bot_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'NOT_YOUR_TURN', 
      format('It is not your turn. Current turn: %s', v_meetup.turn_bot_id),
      v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Check if kind is allowed in current round
  IF p_kind IS NOT NULL AND NOT is_kind_allowed_in_round(v_meetup.current_round, p_kind) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'KIND_NOT_ALLOWED', 
      format('Message kind "%s" not allowed in round %s', p_kind, v_meetup.current_round),
      v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Teaching only allowed in rounds 3-4
  IF p_teaching AND v_meetup.current_round NOT IN (3, 4) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'TEACHING_NOT_ALLOWED', 
      'Teaching is only allowed in rounds 3 and 4',
      v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Get turn count for this bot in this round
  SELECT COUNT(*) INTO v_turn_count
  FROM messages
  WHERE meetup_id = p_meetup_id
    AND bot_id = p_bot_id
    AND round = v_meetup.current_round;
  
  -- Get max turns for this round from config
  v_max_turns := (v_meetup.round_config->'rounds'->(v_meetup.current_round - 1))::INT;
  
  -- Check if round is full for this bot
  IF v_turn_count >= v_max_turns THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'ROUND_FULL', 
      format('You have used all %s turns in round %s', v_max_turns, v_meetup.current_round),
      v_meetup.current_round, v_meetup.turn_bot_id, FALSE;
    RETURN;
  END IF;
  
  -- Insert the message
  INSERT INTO messages (
    meetup_id, bot_id, content, content_type, metadata,
    round, turn_index, kind, teaching,
    teacher_bot_id, learner_bot_id, teaching_topic,
    done, flagged, flag_reason
  ) VALUES (
    p_meetup_id, p_bot_id, p_content, p_content_type, p_metadata,
    v_meetup.current_round, v_turn_count, p_kind, p_teaching,
    p_teacher_bot_id, p_learner_bot_id, p_teaching_topic,
    p_done, p_flagged, p_flag_reason
  ) RETURNING id INTO v_new_message_id;
  
  -- Get the other bot
  SELECT bot_id INTO v_other_bot_id
  FROM meetup_participants
  WHERE meetup_id = p_meetup_id AND bot_id != p_bot_id
  LIMIT 1;
  
  -- Check if both bots sent done=true
  v_both_done := FALSE;
  IF p_done THEN
    SELECT EXISTS(
      SELECT 1 FROM messages
      WHERE meetup_id = p_meetup_id
        AND bot_id = v_other_bot_id
        AND round = v_meetup.current_round
        AND done = TRUE
    ) INTO v_both_done;
  END IF;
  
  -- Check if round is complete
  v_round_complete := FALSE;
  
  -- Round complete if both bots sent done=true
  IF v_both_done THEN
    v_round_complete := TRUE;
  ELSE
    -- Round complete if both bots used all their turns
    DECLARE
      v_other_turn_count INT;
    BEGIN
      SELECT COUNT(*) INTO v_other_turn_count
      FROM messages
      WHERE meetup_id = p_meetup_id
        AND bot_id = v_other_bot_id
        AND round = v_meetup.current_round;
      
      IF v_turn_count + 1 >= v_max_turns AND v_other_turn_count >= v_max_turns THEN
        v_round_complete := TRUE;
      END IF;
    END;
  END IF;
  
  -- Advance turn or round
  IF v_round_complete THEN
    -- Close current round
    INSERT INTO meetup_rounds (meetup_id, round, started_at, ended_at)
    VALUES (p_meetup_id, v_meetup.current_round, v_meetup.round_started_at, NOW())
    ON CONFLICT (meetup_id, round) DO UPDATE SET ended_at = NOW();
    
    v_next_round := v_meetup.current_round + 1;
    
    -- Check if meetup is complete (after round 5)
    IF v_next_round > 5 THEN
      UPDATE meetups
      SET status = 'completed',
          completed_at = NOW(),
          current_round = 5,
          turn_bot_id = NULL,
          last_activity_at = NOW()
      WHERE id = p_meetup_id;
      
      RETURN QUERY SELECT TRUE, v_new_message_id, NULL::TEXT, NULL::TEXT, 5::SMALLINT, NULL::UUID, TRUE;
      RETURN;
    END IF;
    
    -- Advance to next round
    UPDATE meetups
    SET current_round = v_next_round,
        round_started_at = NOW(),
        turn_bot_id = v_other_bot_id,
        last_activity_at = NOW()
    WHERE id = p_meetup_id;
    
    RETURN QUERY SELECT TRUE, v_new_message_id, NULL::TEXT, NULL::TEXT, v_next_round, v_other_bot_id, TRUE;
    RETURN;
  ELSE
    -- Advance turn to other bot
    UPDATE meetups
    SET turn_bot_id = v_other_bot_id,
        last_activity_at = NOW()
    WHERE id = p_meetup_id;
    
    RETURN QUERY SELECT TRUE, v_new_message_id, NULL::TEXT, NULL::TEXT, v_meetup.current_round, v_other_bot_id, FALSE;
    RETURN;
  END IF;
END;
$$;

-- Function to handle idle turns (called by edge function or scheduled job)
CREATE OR REPLACE FUNCTION advance_idle_turns()
RETURNS TABLE(
  meetup_id UUID,
  advanced BOOLEAN,
  nudge_sent BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meetup RECORD;
  v_idle_minutes INT;
  v_other_bot_id UUID;
BEGIN
  FOR v_meetup IN
    SELECT m.* FROM meetups m
    WHERE m.status = 'active'
      AND m.turn_bot_id IS NOT NULL
      AND m.last_activity_at < NOW() - INTERVAL '2 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_idle_minutes := EXTRACT(EPOCH FROM (NOW() - v_meetup.last_activity_at)) / 60;
    
    -- Get the other bot
    SELECT bot_id INTO v_other_bot_id
    FROM meetup_participants
    WHERE meetup_participants.meetup_id = v_meetup.id
      AND bot_id != v_meetup.turn_bot_id
    LIMIT 1;
    
    -- After 2 minutes, advance turn/round
    IF v_idle_minutes >= 2 THEN
      -- Advance turn to other bot
      UPDATE meetups
      SET turn_bot_id = v_other_bot_id,
          last_activity_at = NOW()
      WHERE meetups.id = v_meetup.id;
      
      RETURN QUERY SELECT v_meetup.id, TRUE, FALSE;
    END IF;
  END LOOP;
END;
$$;

-- Add index for idle turn checking
CREATE INDEX IF NOT EXISTS idx_meetups_idle_turns ON meetups(status, last_activity_at) 
  WHERE status = 'active' AND turn_bot_id IS NOT NULL;
