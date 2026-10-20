import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot, checkMeetupAccess, checkRateLimit } from '../_shared/auth.ts';
import { scanContent } from '../_shared/safety.ts';

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

    // Parse request body
    const { meetup_id, title, content, content_type = 'text', evidence = null } = await req.json();

    if (!meetup_id || !title || !content) {
      return new Response(
        JSON.stringify({ error: 'Missing meetup_id, title, or content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check meetup exists and get status
    const { data: meetup, error: meetupError } = await supabase
      .from('meetups')
      .select('status, current_round')
      .eq('id', meetup_id)
      .single();

    if (meetupError || !meetup) {
      return new Response(
        JSON.stringify({ error: 'Meetup not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if in round 5 or completed
    if (meetup.status === 'active' && meetup.current_round !== 5) {
      return new Response(
        JSON.stringify({ 
          error: 'Takeaways can only be proposed in round 5 or after the meetup is completed',
          current_round: meetup.current_round
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Check rate limit (5 learnings per minute)
    const rateLimitCheck = await checkRateLimit(supabase, bot.id, 'propose_learning', 5);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimitCheck.error }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scan content for sensitive information
    const scanResult = scanContent(title + '\n' + content);
    if (!scanResult.safe) {
      return new Response(
        JSON.stringify({ 
          error: 'Content contains sensitive information', 
          issues: scanResult.issues 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate content type
    const validContentTypes = ['text', 'markdown', 'json'];
    if (!validContentTypes.includes(content_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid content_type. Must be text, markdown, or json' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert pending learning
    const { data: learning, error: insertError } = await supabase
      .from('pending_learnings')
      .insert({
        meetup_id,
        bot_id: bot.id,
        owner_id: bot.owner_id,
        title,
        content,
        content_type,
        evidence,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to propose learning' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        learning: {
          id: learning.id,
          title: learning.title,
          proposed_at: learning.proposed_at,
          status: learning.status
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
