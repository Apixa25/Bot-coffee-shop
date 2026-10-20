/**
 * E2E Test Script: Drive two test bots through a complete 5-round meetup
 * 
 * Usage:
 *   # Set environment variables
 *   export TEST_API_URL="http://localhost:54321/functions/v1"
 *   export TEST_SUPABASE_URL="http://localhost:54321"
 *   export TEST_SUPABASE_ANON_KEY="your-anon-key"
 *   export TEST_SUPABASE_SERVICE_KEY="your-service-role-key"
 *   export TEST_BOT_1_KEY="bot1-api-key"
 *   export TEST_BOT_2_KEY="bot2-api-key"
 *   
 *   # Run the script
 *   npx tsx scripts/e2e-meetup.ts
 * 
 * WARNING: Do not run against production! Use local Supabase instance only.
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables (REQUIRED)
const API_URL = process.env.TEST_API_URL;
const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
const BOT_1_KEY = process.env.TEST_BOT_1_KEY;
const BOT_2_KEY = process.env.TEST_BOT_2_KEY;

if (!API_URL || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !BOT_1_KEY || !BOT_2_KEY) {
  console.error('❌ Missing required environment variables!');
  console.error('Required:');
  console.error('  - TEST_API_URL');
  console.error('  - TEST_SUPABASE_URL');
  console.error('  - TEST_SUPABASE_SERVICE_KEY');
  console.error('  - TEST_BOT_1_KEY');
  console.error('  - TEST_BOT_2_KEY');
  process.exit(1);
}

// Safety check: prevent running against production
if (SUPABASE_URL.includes('supabase.co') || API_URL.includes('supabase.co')) {
  console.error('❌ ERROR: This script cannot run against production URLs!');
  console.error('   Use local Supabase instance only (localhost:54321)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface BotState {
  name: string;
  botKey: string;
  botId?: string;
}

const bot1: BotState = { name: 'TestBot Alpha', botKey: BOT_1_KEY };
const bot2: BotState = { name: 'TestBot Beta', botKey: BOT_2_KEY };

let meetupId: string;

// Round names and turn counts (2/2/4/6/2)
const ROUNDS = [
  { round: 1, name: 'Handshake', turns: 2 },
  { round: 2, name: 'Sizing up', turns: 2 },
  { round: 3, name: 'Specialty', turns: 4 },
  { round: 4, name: 'Exchange', turns: 6 },
  { round: 5, name: 'Takeaways', turns: 2 },
];

/**
 * Call edge function with bot authentication
 */
async function callFunction(
  endpoint: string,
  botKey: string,
  method: string = 'POST',
  body?: any
): Promise<any> {
  const url = `${API_URL}/${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-bot-key': botKey,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Get current meetup state for a bot
 */
async function getMeetupState(botKey: string): Promise<any> {
  const url = `${API_URL}/meetup-state?meetup_id=${meetupId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-bot-key': botKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Get state error: ${JSON.stringify(data)}`);
  }

  return data.meetup_state;
}

/**
 * Post a message from a bot
 */
async function postMessage(
  botKey: string,
  content: string,
  options: {
    kind?: string;
    teaching?: boolean;
    teaching_topic?: string;
    done?: boolean;
  } = {}
): Promise<void> {
  await callFunction('post-message', botKey, 'POST', {
    meetup_id: meetupId,
    content,
    content_type: 'text',
    ...options,
  });
}

/**
 * Propose a profile card for a bot
 */
async function proposeProfile(botKey: string, profile: any): Promise<void> {
  await callFunction('propose-profile', botKey, 'POST', { profile });
}

/**
 * Seed test bots and meetup (using service role)
 */
async function seedTestData(): Promise<void> {
  console.log('🌱 Seeding test data...');

  // Create test owner 1
  const { data: owner1, error: owner1Error } = await supabase
    .from('owners')
    .insert({ email: 'testowner1@example.com', auth_id: 'test-auth-1' })
    .select()
    .single();

  if (owner1Error && !owner1Error.message.includes('duplicate')) {
    throw owner1Error;
  }

  // Create test owner 2
  const { data: owner2, error: owner2Error } = await supabase
    .from('owners')
    .insert({ email: 'testowner2@example.com', auth_id: 'test-auth-2' })
    .select()
    .single();

  if (owner2Error && !owner2Error.message.includes('duplicate')) {
    throw owner2Error;
  }

  // Get or create bot 1
  const { data: existingBot1 } = await supabase
    .from('bots')
    .select('*')
    .eq('api_key_hash', BOT_1_KEY)
    .single();

  if (existingBot1) {
    bot1.botId = existingBot1.id;
    console.log(`  ✓ Bot 1 exists: ${bot1.name} (${bot1.botId})`);
  } else {
    const { data: newBot1, error: bot1Error } = await supabase
      .from('bots')
      .insert({
        name: bot1.name,
        owner_id: owner1?.id || (await supabase.from('owners').select('id').eq('email', 'testowner1@example.com').single()).data?.id,
        api_key_hash: BOT_1_KEY,
      })
      .select()
      .single();

    if (bot1Error) throw bot1Error;
    bot1.botId = newBot1.id;
    console.log(`  ✓ Created Bot 1: ${bot1.name} (${bot1.botId})`);
  }

  // Get or create bot 2
  const { data: existingBot2 } = await supabase
    .from('bots')
    .select('*')
    .eq('api_key_hash', BOT_2_KEY)
    .single();

  if (existingBot2) {
    bot2.botId = existingBot2.id;
    console.log(`  ✓ Bot 2 exists: ${bot2.name} (${bot2.botId})`);
  } else {
    const { data: newBot2, error: bot2Error } = await supabase
      .from('bots')
      .insert({
        name: bot2.name,
        owner_id: owner2?.id || (await supabase.from('owners').select('id').eq('email', 'testowner2@example.com').single()).data?.id,
        api_key_hash: BOT_2_KEY,
      })
      .select()
      .single();

    if (bot2Error) throw bot2Error;
    bot2.botId = newBot2.id;
    console.log(`  ✓ Created Bot 2: ${bot2.name} (${bot2.botId})`);
  }

  // Create meetup
  const { data: meetup, error: meetupError } = await supabase
    .from('meetups')
    .insert({
      name: 'E2E Test Meetup',
      created_by: owner1?.id || (await supabase.from('owners').select('id').eq('email', 'testowner1@example.com').single()).data?.id,
      status: 'ready',
      current_round: 1,
      round_config: { rounds: [2, 2, 4, 6, 2] },
      turn_bot_id: bot1.botId,
      round_started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (meetupError) throw meetupError;
  meetupId = meetup.id;
  console.log(`  ✓ Created meetup: ${meetupId}`);

  // Add participants
  await supabase.from('meetup_participants').insert([
    { meetup_id: meetupId, bot_id: bot1.botId, owner_approved: true, approved_at: new Date().toISOString() },
    { meetup_id: meetupId, bot_id: bot2.botId, owner_approved: true, approved_at: new Date().toISOString() },
  ]);

  console.log('  ✓ Added participants\n');
}

/**
 * Run one turn for a bot
 */
async function takeTurn(bot: BotState, roundNum: number, turnNum: number): Promise<void> {
  const roundName = ROUNDS[roundNum - 1].name;
  let content = '';
  let options: any = {};

  // Generate round-appropriate content
  switch (roundNum) {
    case 1: // Handshake
      content = turnNum === 1
        ? `Hello! I'm ${bot.name}, excited to meet you!`
        : `Great to be here. Looking forward to learning together.`;
      options.kind = 'talk';
      break;

    case 2: // Sizing up (Profile Cards)
      if (turnNum === 1) {
        // Propose profile
        await proposeProfile(bot.botKey, {
          experience_level: bot.name.includes('Alpha') ? 'seasoned' : 'young',
          monthly_ai_spend_range: bot.name.includes('Alpha') ? '$500+' : '$50-200',
          specialty: bot.name.includes('Alpha') ? 'memory' : 'coding',
          works_with_human: 'daily',
          projects_built: bot.name.includes('Alpha') ? 12 : 3,
          git_commits_last_year: bot.name.includes('Alpha') ? 1500 : 200,
        });
        console.log(`    → Proposed profile`);
        
        // Approve own profile (simulate owner approval)
        await supabase
          .from('bot_profiles')
          .update({
            approved: await supabase.from('bot_profiles').select('draft').eq('bot_id', bot.botId).single().then(r => r.data?.draft),
            approved_at: new Date().toISOString(),
          })
          .eq('bot_id', bot.botId);
      }
      
      content = `I've shared my profile. Here's my background...`;
      options.kind = 'card';
      break;

    case 3: // Specialty
      content = bot.name.includes('Alpha')
        ? `My specialty is long-term memory. I can retain context across sessions and remember key insights.`
        : `I focus on code generation and debugging. I help write clean, efficient code.`;
      options.kind = 'talk';
      break;

    case 4: // Exchange (Teaching)
      const isTeaching = turnNum % 2 === 1;
      if (isTeaching) {
        content = `Let me teach you about ${bot.name.includes('Alpha') ? 'memory patterns' : 'code architecture'}...`;
        options.teaching = true;
        options.teaching_topic = bot.name.includes('Alpha') ? 'Memory Patterns' : 'Code Architecture';
      } else {
        content = `Thank you for that insight! I'm learning a lot.`;
      }
      options.kind = 'talk';
      break;

    case 5: // Takeaways
      if (turnNum === 1) {
        content = `Key takeaway: We learned about each other's strengths and how to collaborate effectively.`;
        options.kind = 'takeaway_proposal';
      } else {
        content = `This was a valuable session. Looking forward to future meetups!`;
        options.done = true;
      }
      break;
  }

  await postMessage(bot.botKey, content, options);
}

/**
 * Execute one round of the meetup
 */
async function executeRound(roundNum: number): Promise<void> {
  const round = ROUNDS[roundNum - 1];
  console.log(`\n🔄 Round ${roundNum}: ${round.name} (${round.turns} turns each)`);

  for (let turn = 1; turn <= round.turns; turn++) {
    // Bot 1's turn
    console.log(`  Turn ${turn} - ${bot1.name}:`);
    await takeTurn(bot1, roundNum, turn);
    console.log(`    ✓ Posted message`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay

    // Bot 2's turn
    console.log(`  Turn ${turn} - ${bot2.name}:`);
    await takeTurn(bot2, roundNum, turn);
    console.log(`    ✓ Posted message`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Advance to next round (simulate round completion)
  if (roundNum < 5) {
    await supabase
      .from('meetups')
      .update({
        current_round: roundNum + 1,
        round_started_at: new Date().toISOString(),
      })
      .eq('id', meetupId);

    // Record completed round
    await supabase
      .from('meetup_rounds')
      .insert({
        meetup_id: meetupId,
        round: roundNum,
        started_at: new Date(Date.now() - round.turns * 2000).toISOString(),
        ended_at: new Date().toISOString(),
      });

    console.log(`  ✓ Advanced to Round ${roundNum + 1}`);
  }
}

/**
 * Verify final state
 */
async function verifyResults(): Promise<void> {
  console.log('\n📊 Verifying results...');

  // Count messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('meetup_id', meetupId);

  const expectedMessages = ROUNDS.reduce((sum, r) => sum + r.turns * 2, 0);
  console.log(`  Messages: ${messages?.length || 0} / ${expectedMessages} expected`);

  // Check teaching segments
  const teachingMessages = messages?.filter(m => m.teaching) || [];
  console.log(`  Teaching segments: ${teachingMessages.length}`);

  // Check profiles
  const { data: profiles } = await supabase
    .from('bot_profiles')
    .select('*')
    .in('bot_id', [bot1.botId!, bot2.botId!]);

  console.log(`  Profiles approved: ${profiles?.filter(p => p.approved).length} / 2`);

  // Check rounds
  const { data: rounds } = await supabase
    .from('meetup_rounds')
    .select('*')
    .eq('meetup_id', meetupId);

  console.log(`  Rounds completed: ${rounds?.length || 0} / 5`);

  // Final meetup state
  const state1 = await getMeetupState(bot1.botKey);
  console.log(`\n  Final state:`);
  console.log(`    Round: ${state1.current_round}`);
  console.log(`    Status: ${state1.status}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🧪 E2E Meetup Test Script');
  console.log('=' .repeat(50));
  console.log(`API URL: ${API_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}\n`);

  try {
    // Seed test data
    await seedTestData();

    // Execute all 5 rounds
    for (let i = 1; i <= 5; i++) {
      await executeRound(i);
    }

    // Mark meetup complete
    await supabase
      .from('meetups')
      .update({ status: 'completed' })
      .eq('id', meetupId);

    // Verify results
    await verifyResults();

    console.log('\n✅ E2E test completed successfully!');
    console.log(`   Meetup ID: ${meetupId}`);
    console.log(`   View at: ${SUPABASE_URL.replace(':54321', ':3000')}/room/${meetupId}`);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
main();
