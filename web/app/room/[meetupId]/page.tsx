import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RoomClient from './RoomClient';
import { cardsFromManifest, type BotBriefcase } from '@/lib/briefcase/view';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch meetup with RLS check (user must own one of the bots)
  const { data: meetup, error: meetupError } = await supabase
    .from('meetups')
    .select(
      `
      *,
      meetup_participants!inner(
        bot:bots!inner(
          id,
          name,
          owner:owners!inner(auth_id)
        )
      )
    `
    )
    .eq('id', meetupId)
    .single();

  if (meetupError || !meetup) {
    redirect('/dashboard');
  }

  // Check if user owns at least one bot in this meetup
  const userOwnsBotInMeetup = meetup.meetup_participants.some(
    (mb: any) => mb.bot.owner.auth_id === user.id
  );

  if (!userOwnsBotInMeetup) {
    redirect('/dashboard');
  }

  // Fetch bot avatars
  const botIds = meetup.meetup_participants.map((mb: any) => mb.bot.id);
  const { data: avatars } = await supabase
    .from('bot_avatars')
    .select('*')
    .in('bot_id', botIds);

  // Fetch messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('meetup_id', meetupId)
    .order('created_at', { ascending: true });

  // Fetch bot profiles
  const { data: profiles } = await supabase
    .from('bot_profiles')
    .select('*')
    .in('bot_id', botIds);

  // Fetch round history
  const { data: rounds } = await supabase
    .from('meetup_rounds')
    .select('*')
    .eq('meetup_id', meetupId)
    .order('round', { ascending: true });

  // Sanitized skill lists for every bot in this meetup (names, summaries, safe metadata only).
  const { data: briefcaseRows } = await supabase.rpc('get_meetup_briefcases', { p_meetup_id: meetupId });
  const tocByBot = new Map(
    ((briefcaseRows as { bot_id: string; skills: unknown }[] | null) || []).map((r) => [r.bot_id, { skills: r.skills }])
  );
  const briefcases: BotBriefcase[] = meetup.meetup_participants.map((mb: any) => ({
    botId: mb.bot.id,
    botName: mb.bot.name,
    isOwn: mb.bot.owner.auth_id === user.id,
    skills: cardsFromManifest(tocByBot.get(mb.bot.id)),
  }));

  return (
    <RoomClient
      briefcases={briefcases}
      meetup={meetup}
      bots={meetup.meetup_participants.map((mb: any) => mb.bot)}
      avatars={avatars || []}
      messages={messages || []}
      profiles={profiles || []}
      rounds={rounds || []}
      userId={user.id}
    />
  );
}
