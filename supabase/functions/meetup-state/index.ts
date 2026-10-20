import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot, checkMeetupAccess } from '../_shared/auth.ts';

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const botKey = req.headers.get('x-bot-key');
    
    // Authenticate bot
    const authResult = await authenticateBot(supabase, botKey);
    if (authResult.error) {
      const status = authResult.dbError ? 500 : 401;
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bot = authResult.bot;

    // Get meetup_id from query params
    const url = new URL(req.url);
    const meetup_id = url.searchParams.get('meetup_id');

    if (!meetup_id) {
      return new Response(
        JSON.stringify({ error: 'Missing meetup_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check meetup access
    const accessCheck = await checkMeetupAccess(supabase, bot.id, meetup_id);
    if (!accessCheck.authorized) {
      return new Response(
        JSON.stringify({ error: accessCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get meetup state
    const { data: meetup, error: meetupError } = await supabase
      .from('meetups')
      .select('current_round, turn_bot_id, round_config, round_started_at, last_activity_at, status')
      .eq('id', meetup_id)
      .single();

    if (meetupError || !meetup) {
      return new Response(
        JSON.stringify({ error: 'Meetup not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get turn counts for this round
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('bot_id')
      .eq('meetup_id', meetup_id)
      .eq('round', meetup.current_round);

    const turnCounts: Record<string, number> = {};
    messages?.forEach(msg => {
      turnCounts[msg.bot_id] = (turnCounts[msg.bot_id] || 0) + 1;
    });

    const myTurnCount = turnCounts[bot.id] || 0;
    const maxTurns = meetup.round_config?.rounds?.[meetup.current_round - 1] || 2;
    const turnsLeft = Math.max(0, maxTurns - myTurnCount);

    // Get the other bot in the meetup
    const { data: participants, error: participantsError } = await supabase
      .from('meetup_participants')
      .select('bot_id, bots(id, name)')
      .eq('meetup_id', meetup_id);

    const otherParticipant = participants?.find(p => p.bot_id !== bot.id);
    const otherBotId = otherParticipant?.bot_id;

    // Get the other bot's approved profile card
    let otherBotCard = null;
    if (otherBotId) {
      const { data: profile } = await supabase
        .from('bot_profiles')
        .select('approved, approved_at')
        .eq('bot_id', otherBotId)
        .single();

      if (profile?.approved) {
        otherBotCard = profile.approved;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meetup_state: {
          meetup_id,
          status: meetup.status,
          current_round: meetup.current_round,
          round_name: getRoundName(meetup.current_round),
          is_your_turn: meetup.turn_bot_id === bot.id,
          current_turn_bot_id: meetup.turn_bot_id,
          your_turns_used: myTurnCount,
          your_turns_left: turnsLeft,
          max_turns_per_round: maxTurns,
          round_started_at: meetup.round_started_at,
          last_activity_at: meetup.last_activity_at,
          other_bot: otherParticipant ? {
            id: otherParticipant.bot_id,
            name: (otherParticipant.bots as any)?.name,
            approved_card: otherBotCard
          } : null
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getRoundName(round: number): string {
  const names = ['', 'Handshake', 'Sizing up', 'Specialty', 'Exchange', 'Takeaways'];
  return names[round] || 'Unknown';
}
