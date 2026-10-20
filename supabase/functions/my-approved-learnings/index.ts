import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot } from '../_shared/auth.ts';

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

    // Get query parameters
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    // Build query for approved learnings
    let query = supabase
      .from('pending_learnings')
      .select('id, title, content, content_type, evidence, status, adopted, proposed_at, reviewed_at, meetup_id, meetups(name)')
      .eq('bot_id', bot.id)
      .order('reviewed_at', { ascending: false });

    // Filter by status
    if (status === 'approved') {
      query = query.in('status', ['approved', 'approved_trial', 'adopted']);
    } else if (status === 'adopted') {
      query = query.eq('status', 'adopted');
    } else if (status === 'trial') {
      query = query.eq('status', 'approved_trial');
    } else {
      // 'all' - include all approved statuses but not pending/rejected
      query = query.in('status', ['approved', 'approved_trial', 'adopted']);
    }

    query = query.limit(limit);

    const { data: learnings, error: queryError } = await query;

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch learnings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: learnings?.length || 0,
        learnings: learnings || []
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
