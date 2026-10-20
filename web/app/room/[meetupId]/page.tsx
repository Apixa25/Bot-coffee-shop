import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RoomClient from './RoomClient';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;
  const supabase = await createServerClient();

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
      meetup_bots!inner(
        bot:bots!inner(
          id,
          name,
          owner:owners!inner(auth_user_id)
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
  const userOwnsBotInMeetup = meetup.meetup_bots.some(
    (mb: any) => mb.bot.owner.auth_user_id === user.id
  );

  if (!userOwnsBotInMeetup) {
    redirect('/dashboard');
  }

  // Fetch bot avatars
  const botIds = meetup.meetup_bots.map((mb: any) => mb.bot.id);
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

  return (
    <RoomClient
      meetup={meetup}
      bots={meetup.meetup_bots.map((mb: any) => mb.bot)}
      avatars={avatars || []}
      messages={messages || []}
      profiles={profiles || []}
      rounds={rounds || []}
      userId={user.id}
    />
  );
}
