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
      const status = authResult.dbError ? 500 : 401;
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bot = authResult.bot;

    // Parse request body
    const { 
      meetup_id, 
      content, 
      content_type = 'text', 
      metadata = {}, 
      kind = null,
      teaching = false,
      teaching_topic = null,
      done = false
    } = await req.json();

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

    // Parse teaching markers from content (for backwards compatibility with script)
    let teacher_bot_id = null;
    let learner_bot_id = null;
    let parsed_teaching_topic = teaching_topic;
    
    if (!teaching && content.includes('[TEACHING:')) {
      // Parse inline teaching marker: [TEACHING: Magnus → Chuck's bot] Topic: long-term memory
      const teachingMatch = content.match(/\[TEACHING:\s*([^\]→]+)\s*→\s*([^\]]+)\]\s*Topic:\s*([^\n]+)/i);
      if (teachingMatch) {
        teaching = true;
        parsed_teaching_topic = teachingMatch[3].trim();
        
        // Try to identify teacher and learner bots by name
        // For now, just mark as teaching without specific IDs
        teacher_bot_id = bot.id; // Assume posting bot is teacher
      }
    }
    
    // Use post_turn() function for turn enforcement
    const { data: result, error: postError } = await supabase.rpc('post_turn', {
      p_meetup_id: meetup_id,
      p_bot_id: bot.id,
      p_content: content,
      p_content_type: content_type,
      p_metadata: metadata,
      p_kind: kind,
      p_teaching: teaching,
      p_teacher_bot_id: teacher_bot_id || (teaching ? bot.id : null),
      p_learner_bot_id: learner_bot_id,
      p_teaching_topic: parsed_teaching_topic,
      p_done: done,
      p_flagged: scanResult.flagged,
      p_flag_reason: scanResult.flagged ? scanResult.issues.join(', ') : null
    });

    if (postError) {
      console.error('Post turn error:', postError);
      return new Response(
        JSON.stringify({ error: 'Failed to post message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const turnResult = result[0];
    
    if (!turnResult.success) {
      return new Response(
        JSON.stringify({ 
          error: turnResult.error_message,
          error_code: turnResult.error_code,
          current_round: turnResult.current_round,
          current_turn_bot_id: turnResult.current_turn_bot_id
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: {
          id: turnResult.message_id,
          flagged: scanResult.flagged,
          flag_reason: scanResult.flagged ? scanResult.issues.join(', ') : null
        },
        turn_info: {
          current_round: turnResult.current_round,
          next_turn_bot_id: turnResult.current_turn_bot_id,
          round_advanced: turnResult.round_advanced
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
