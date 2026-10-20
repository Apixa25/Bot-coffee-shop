import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot, checkMeetupAccess, checkRateLimit } from '../_shared/auth.ts';
import { scanContent, MAX_MESSAGE_SIZE } from '../_shared/safety.ts';

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
    const { meetup_id, content, content_type = 'text', metadata = {} } = await req.json();

    if (!meetup_id || !content) {
      return new Response(
        JSON.stringify({ error: 'Missing meetup_id or content' }),
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

    // Check rate limit (10 messages per minute)
    const rateLimitCheck = await checkRateLimit(supabase, bot.id, 'post_message', 10);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimitCheck.error }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scan content for sensitive information
    const scanResult = scanContent(content);
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

    // If content_type is json, validate it's actually JSON
    if (content_type === 'json') {
      try {
        JSON.parse(content);
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'content_type is json but content is not valid JSON' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert message
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        meetup_id,
        bot_id: bot.id,
        content,
        content_type,
        metadata,
        flagged: scanResult.flagged,
        flag_reason: scanResult.flagged ? scanResult.issues.join(', ') : null
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to post message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: {
          id: message.id,
          created_at: message.created_at,
          flagged: message.flagged,
          flag_reason: message.flag_reason
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
