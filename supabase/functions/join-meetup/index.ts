import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot, checkRateLimit } from '../_shared/auth.ts';

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get bot key from header
    const botKey = req.headers.get('x-bot-key');
    
    // Authenticate bot
    const authResult = await authenticateBot(supabase, botKey);
    if (authResult.error) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bot = authResult.bot;

    // Parse request body
    const { meetup_id } = await req.json();

    if (!meetup_id) {
      return new Response(
        JSON.stringify({ error: 'Missing meetup_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const rateLimitCheck = await checkRateLimit(supabase, bot.id, 'join_meetup', 5);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimitCheck.error }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if bot's owner has been invited to this meetup
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('id, status')
      .eq('meetup_id', meetup_id)
      .eq('invitee_id', bot.owner_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: 'Bot owner not invited to this meetup' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (invite.status !== 'accepted') {
      return new Response(
        JSON.stringify({ error: 'Invite not accepted yet' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if bot is already in the meetup
    const { data: existing } = await supabase
      .from('meetup_participants')
      .select('id, owner_approved')
      .eq('meetup_id', meetup_id)
      .eq('bot_id', bot.id)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Bot already in meetup',
          waiting_for_approval: !existing.owner_approved
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add bot to meetup (waiting for owner approval)
    const { data: participant, error: insertError } = await supabase
      .from('meetup_participants')
      .insert({
        meetup_id,
        bot_id: bot.id,
        owner_approved: false,
        joined_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to join meetup' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Bot added to meetup, waiting for owner approval',
        participant_id: participant.id
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
