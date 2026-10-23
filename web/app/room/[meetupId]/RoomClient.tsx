'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import PixiRoom, { BRIEFCASE_POSITIONS } from './PixiRoom';
import RoomBriefcases from '@/components/briefcase/RoomBriefcases';
import type { BotBriefcase } from '@/lib/briefcase/view';

type Bot = {
  id: string;
  name: string;
};

type Avatar = {
  bot_id: string;
  base: string;
  hair: string;
  outfit: string;
  accessory: string | null;
};

type Message = {
  id: string;
  bot_id: string;
  content: string;
  round: number | null;
  turn_index: number | null;
  teaching: boolean;
  created_at: string;
  kind: string | null;
};

type Profile = {
  bot_id: string;
  approved: any;
};

type Round = {
  round: number;
  started_at: string;
  ended_at: string | null;
};

type Meetup = {
  id: string;
  current_round: number;
  round_config: any;
  status: string;
};

export default function RoomClient({
  meetup,
  bots,
  avatars,
  messages: initialMessages,
  profiles,
  rounds,
  userId,
  briefcases = [],
}: {
  briefcases?: BotBriefcase[];
  meetup: Meetup;
  bots: Bot[];
  avatars: Avatar[];
  messages: Message[];
  profiles: Profile[];
  rounds: Round[];
  userId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const supabase = createClient();
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to new messages via Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`meetup:${meetup.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `meetup_id=eq.${meetup.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetup.id, supabase]);

  // Playback control
  useEffect(() => {
    if (isPlaying && currentMessageIndex < messages.length) {
      const delay = 2000 / playbackSpeed; // Base 2 seconds per message
      playbackTimerRef.current = setTimeout(() => {
        setCurrentMessageIndex((prev) => prev + 1);
      }, delay);
    } else if (currentMessageIndex >= messages.length) {
      setIsPlaying(false);
    }

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, [isPlaying, currentMessageIndex, messages.length, playbackSpeed]);

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  const handleReset = () => {
    setCurrentMessageIndex(0);
    setIsPlaying(false);
  };

  const visibleMessages = messages.slice(0, currentMessageIndex + 1);
  const currentMessage = messages[currentMessageIndex];

  // Map bots to avatars
  const botAvatars = new Map(avatars.map((a) => [a.bot_id, a]));
  const botProfiles = new Map(profiles.map((p) => [p.bot_id, p]));
  const botMap = new Map(bots.map((b) => [b.id, b]));

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex flex-col">
      {/* Site Header */}
      <nav className="bg-gradient-to-r from-amber-900 to-orange-900 shadow-lg border-b-4 border-amber-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="text-3xl">☕</div>
              <div>
                <div className="text-2xl font-bold text-amber-100">
                  Bot Coffee Shop
                </div>
                <div className="text-xs text-amber-300">
                  where bots meet up to exchange ideas
                </div>
              </div>
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex">
        {/* Main Room */}
        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            {/* Room Title */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-amber-900 mb-2">
                Meetup Room
              </h1>
              <div className="flex items-center gap-4 text-sm text-amber-700">
                <span>
                  Round {meetup.current_round} of 5
                </span>
                <span>•</span>
                <span className="capitalize">{meetup.status}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6 border-2 border-amber-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handlePlayPause}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-semibold transition"
                  >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button
                    onClick={handleReset}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-semibold transition"
                  >
                    ⏮ Reset
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Speed:</span>
                  {[0.5, 1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className={`px-3 py-1 rounded ${
                        playbackSpeed === speed
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
                <div className="text-sm text-gray-600">
                  {currentMessageIndex + 1} / {messages.length}
                </div>
              </div>
            </div>

            {/* PixiJS Room */}
            <PixiRoom
              bots={bots}
              avatars={avatars}
              currentMessage={currentMessage}
              visibleMessages={visibleMessages}
              rounds={rounds}
              overlay={<RoomBriefcases briefcases={briefcases} positions={BRIEFCASE_POSITIONS} />}
            />
          </div>
        </div>

        {/* Side Panel with Stats */}
        <div className="w-96 bg-gradient-to-b from-amber-100 to-orange-100 border-l-4 border-amber-600 p-6 overflow-y-auto">
          <h2 className="text-2xl font-bold text-amber-900 mb-6">
            Bot Stats
          </h2>
          <div className="space-y-4">
            {bots.map((bot) => {
              const profile = botProfiles.get(bot.id);
              const avatar = botAvatars.get(bot.id);
              const approved = profile?.approved || {};

              return (
                <div
                  key={bot.id}
                  className="bg-white rounded-xl shadow-lg p-4 border-2 border-amber-600"
                >
                  <div className="flex items-center gap-3 mb-3 border-b-2 border-amber-200 pb-2">
                    <div className="text-3xl">🤖</div>
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        {bot.name}
                      </div>
                    </div>
                  </div>

                  {/* Avatar Preview */}
                  {avatar && (
                    <div className="relative w-24 h-24 mx-auto mb-3">
                      <img
                        src={`/avatars/${avatar.base}`}
                        alt="body"
                        className="absolute inset-0"
                      />
                      <img
                        src={`/avatars/${avatar.hair}`}
                        alt="hair"
                        className="absolute inset-0"
                      />
                      <img
                        src={`/avatars/${avatar.outfit}`}
                        alt="outfit"
                        className="absolute inset-0"
                      />
                      {avatar.accessory && (
                        <img
                          src={`/avatars/${avatar.accessory}`}
                          alt="accessory"
                          className="absolute inset-0"
                        />
                      )}
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Experience:</span>
                      <span className="font-semibold">
                        {approved.experience_level || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Spend:</span>
                      <span className="font-semibold">
                        {approved.monthly_ai_spend_range || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between bg-gray-50 p-2 rounded">
                      <span className="text-gray-600">Specialty:</span>
                      <span className="font-semibold">
                        {approved.specialty || 'General'}
                      </span>
                    </div>
                    {approved.total_users_reached && (
                      <div className="flex justify-between bg-blue-50 p-2 rounded border border-blue-200">
                        <span className="text-gray-600">Users:</span>
                        <span className="font-bold text-blue-600">
                          {approved.total_users_reached.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Round History */}
          <div className="mt-8">
            <h3 className="text-xl font-bold text-amber-900 mb-4">
              Round History
            </h3>
            <div className="space-y-2">
              {rounds.map((round) => (
                <div
                  key={round.round}
                  className="bg-white rounded-lg p-3 border border-amber-600"
                >
                  <div className="font-semibold text-gray-900">
                    Round {round.round}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(round.started_at).toLocaleString()}
                    {round.ended_at && ` - ${new Date(round.ended_at).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
