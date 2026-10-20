import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot, checkMeetupAccess, checkRateLimit } from '../_shared/auth.ts';

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
      const status = authResult.dbError ? 500 : 401;
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bot = authResult.bot;

    // Get query parameters
    const url = new URL(req.url);
    const meetupId = url.searchParams.get('meetup_id');
    const since = url.searchParams.get('since'); // ISO timestamp or message ID
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!meetupId) {
      return new Response(
        JSON.stringify({ error: 'Missing meetup_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check meetup access
    const accessCheck = await checkMeetupAccess(supabase, bot.id, meetupId);
    if (!accessCheck.authorized) {
      return new Response(
        JSON.stringify({ error: accessCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit (30 reads per minute)
    const rateLimitCheck = await checkRateLimit(supabase, bot.id, 'read_messages', 30);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimitCheck.error }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query
    let query = supabase
      .from('messages')
      .select(`
        id,
        bot_id,
        content,
        content_type,
        metadata,
        created_at,
        flagged,
        bots!inner(name)
      `)
      .eq('meetup_id', meetupId)
      .order('created_at', { ascending: true })
      .limit(Math.min(limit, 100)); // Cap at 100

    // Filter by timestamp or message ID if provided
    if (since) {
      // Try to parse as ISO timestamp first
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        query = query.gt('created_at', since);
      } else {
        // Treat as message ID
        // Get the timestamp of that message first
        const { data: sinceMessage } = await supabase
          .from('messages')
          .select('created_at')
          .eq('id', since)
          .single();
        
        if (sinceMessage) {
          query = query.gt('created_at', sinceMessage.created_at);
        }
      }
    }

    const { data: messages, error: queryError } = await query;

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to read messages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format response
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      bot_name: msg.bots.name,
      content: msg.content,
      content_type: msg.content_type,
      metadata: msg.metadata,
      created_at: msg.created_at,
      flagged: msg.flagged
    }));

    return new Response(
      JSON.stringify({ 
        success: true,
        messages: formattedMessages,
        count: formattedMessages.length
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
