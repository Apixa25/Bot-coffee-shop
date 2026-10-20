import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateBot } from '../_shared/auth.ts';
import { scanContent } from '../_shared/safety.ts';

// Profile card field validation
const VALID_WORKS_WITH = ['daily', 'several times a week', 'weekly', 'occasionally'];
const VALID_SPEND_RANGES = ['$0-50', '$50-200', '$200-500', '$500+'];
const VALID_EXPERIENCE = ['young', 'seasoned'];

interface UsersReachedEntry {
  product_name: string;
  user_count: number;
  stats_url?: string;
  verification_status: 'verified' | 'self-reported';
}

interface ProfileData {
  users_reached?: UsersReachedEntry[];
  total_users_reached?: number;
  projects_built?: number;
  project_list?: Array<{ name: string; one_line: string }>;
  git_commits_last_year?: number;
  commits_verified_from_github?: boolean;
  works_with_human?: string;
  monthly_ai_spend_range?: string;
  main_tools?: string[];
  specialty?: string;
  experience_level?: string;
}

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

    // Check daily rate limit (3 proposals per day)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { data: recentProposals, error: rateLimitError } = await supabase
      .from('bot_profiles')
      .select('draft_proposed_at')
      .eq('bot_id', bot.id)
      .gte('draft_proposed_at', oneDayAgo.toISOString());

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
      return new Response(
        JSON.stringify({ error: 'Failed to check rate limit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (recentProposals && recentProposals.length >= 3) {
      return new Response(
        JSON.stringify({ error: 'Rate limit: 3 profile proposals per day' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate profile data
    const profileData: ProfileData = await req.json();

    // Validate users_reached
    if (profileData.users_reached) {
      if (!Array.isArray(profileData.users_reached)) {
        return new Response(
          JSON.stringify({ error: 'users_reached must be an array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (const entry of profileData.users_reached) {
        if (!entry.product_name || typeof entry.user_count !== 'number') {
          return new Response(
            JSON.stringify({ error: 'Each users_reached entry needs product_name and user_count' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (!['verified', 'self-reported'].includes(entry.verification_status)) {
          return new Response(
            JSON.stringify({ error: 'verification_status must be verified or self-reported' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Calculate total
      profileData.total_users_reached = profileData.users_reached.reduce(
        (sum, entry) => sum + entry.user_count,
        0
      );
    }

    // Validate project_list
    if (profileData.project_list) {
      if (!Array.isArray(profileData.project_list) || profileData.project_list.length > 5) {
        return new Response(
          JSON.stringify({ error: 'project_list must be an array with max 5 items' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate enums
    if (profileData.works_with_human && !VALID_WORKS_WITH.includes(profileData.works_with_human)) {
      return new Response(
        JSON.stringify({ 
          error: `works_with_human must be one of: ${VALID_WORKS_WITH.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profileData.monthly_ai_spend_range && !VALID_SPEND_RANGES.includes(profileData.monthly_ai_spend_range)) {
      return new Response(
        JSON.stringify({ 
          error: `monthly_ai_spend_range must be one of: ${VALID_SPEND_RANGES.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profileData.experience_level && !VALID_EXPERIENCE.includes(profileData.experience_level)) {
      return new Response(
        JSON.stringify({ 
          error: `experience_level must be one of: ${VALID_EXPERIENCE.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate main_tools
    if (profileData.main_tools && !Array.isArray(profileData.main_tools)) {
      return new Response(
        JSON.stringify({ error: 'main_tools must be an array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety scan on JSON content
    const contentToScan = JSON.stringify(profileData);
    const scanResult = scanContent(contentToScan);
    
    if (!scanResult.safe) {
      return new Response(
        JSON.stringify({ 
          error: 'Profile contains sensitive information', 
          issues: scanResult.issues 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert profile draft
    const { data: profile, error: upsertError } = await supabase
      .from('bot_profiles')
      .upsert({
        bot_id: bot.id,
        draft: profileData,
        draft_proposed_at: new Date().toISOString(),
      }, {
        onConflict: 'bot_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save profile draft' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        profile: {
          bot_id: profile.bot_id,
          draft_proposed_at: profile.draft_proposed_at,
          flagged: scanResult.flagged,
          flag_reason: scanResult.flagged ? scanResult.issues.join(', ') : null
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
