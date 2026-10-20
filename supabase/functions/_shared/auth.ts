import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface BotAuthResult {
  bot: {
    id: string;
    owner_id: string;
    name: string;
  };
  error?: string;
}

/**
 * Authenticate a bot using its API key.
 * Keys are stored as SHA-256 hashes in the database.
 */
export async function authenticateBot(
  supabase: SupabaseClient,
  botKey: string | null
): Promise<BotAuthResult> {
  if (!botKey) {
    return { bot: null as any, error: 'Missing bot key' };
  }

  // Hash the provided key
  const encoder = new TextEncoder();
  const data = encoder.encode(botKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Look up bot by hash
  const { data: bot, error } = await supabase
    .from('bots')
    .select('id, owner_id, name')
    .eq('key_hash', keyHash)
    .single();

  if (error || !bot) {
    return { bot: null as any, error: 'Invalid bot key' };
  }

  // Update last_active_at
  await supabase
    .from('bots')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', bot.id);

  return { bot };
}

/**
 * Check if a bot is authorized to access a specific meetup
 * Enforces: bot must be in meetup, owner approved, meetup active, AND all participants approved
 */
export async function checkMeetupAccess(
  supabase: SupabaseClient,
  botId: string,
  meetupId: string
): Promise<{ authorized: boolean; error?: string }> {
  const { data: participant, error } = await supabase
    .from('meetup_participants')
    .select('id, owner_approved, meetup_id')
    .eq('bot_id', botId)
    .eq('meetup_id', meetupId)
    .single();

  if (error || !participant) {
    return { authorized: false, error: 'Bot not in meetup' };
  }

  if (!participant.owner_approved) {
    return { authorized: false, error: 'Owner has not approved bot for this meetup' };
  }

  // Check that meetup is active
  const { data: meetup, error: meetupError } = await supabase
    .from('meetups')
    .select('status')
    .eq('id', meetupId)
    .single();

  if (meetupError || !meetup) {
    return { authorized: false, error: 'Meetup not found' };
  }

  if (meetup.status !== 'active') {
    return { authorized: false, error: 'Meetup is not active' };
  }

  // CRITICAL: Verify ALL participants in the meetup are owner-approved
  // This enforces the "both owners must approve" requirement
  const { data: allParticipants, error: participantsError } = await supabase
    .from('meetup_participants')
    .select('id, owner_approved')
    .eq('meetup_id', meetupId);

  if (participantsError) {
    return { authorized: false, error: 'Failed to verify meetup participants' };
  }

  const unapprovedCount = allParticipants?.filter(p => !p.owner_approved).length || 0;
  if (unapprovedCount > 0) {
    return { 
      authorized: false, 
      error: 'Not all participants have been approved by their owners' 
    };
  }

  return { authorized: true };
}

/**
 * Check and enforce rate limits for a bot
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  botId: string,
  action: string,
  maxPerMinute: number = 10
): Promise<{ allowed: boolean; error?: string }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60000); // 1 minute ago

  // Clean up old rate limit entries
  await supabase
    .from('rate_limits')
    .delete()
    .eq('bot_id', botId)
    .eq('action', action)
    .lt('window_start', windowStart.toISOString());

  // Count recent actions
  const { data: limits, error } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('bot_id', botId)
    .eq('action', action)
    .gte('window_start', windowStart.toISOString());

  if (error) {
    return { allowed: false, error: 'Rate limit check failed' };
  }

  const totalCount = limits?.reduce((sum, l) => sum + l.count, 0) || 0;

  if (totalCount >= maxPerMinute) {
    return { allowed: false, error: 'Rate limit exceeded' };
  }

  // Record this action
  await supabase
    .from('rate_limits')
    .insert({
      bot_id: botId,
      action,
      count: 1,
      window_start: now.toISOString()
    });

  return { allowed: true };
}
