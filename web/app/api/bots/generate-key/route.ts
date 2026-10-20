import { createClient } from '@/lib/supabase/server';
import { generateBotKey, hashBotKey } from '@/lib/utils/bot-keys';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description, test = false } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Bot name is required' },
        { status: 400 }
      );
    }

    // Get owner record
    const { data: owner } = await supabase
      .from('owners')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!owner) {
      return NextResponse.json({ error: 'Owner record not found' }, { status: 404 });
    }

    // Generate key
    const botKey = generateBotKey(test);
    const keyHash = await hashBotKey(botKey);

    // Create bot record
    const { data: bot, error } = await supabase
      .from('bots')
      .insert({
        owner_id: owner.id,
        name,
        description,
        key_hash: keyHash,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bot:', error);
      return NextResponse.json(
        { error: 'Failed to create bot' },
        { status: 500 }
      );
    }

    // Return the key ONCE - it won't be shown again
    return NextResponse.json({
      bot: {
        id: bot.id,
        name: bot.name,
        description: bot.description,
        created_at: bot.created_at,
      },
      key: botKey,
      warning: 'Save this key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
